//! Actual MCP runtime: connects to servers over stdio, performs the
//! JSON-RPC handshake, discovers tools, and calls tools.
//!
//! Uses tokio::process for the transport layer — intentionally avoids
//! the full rmcp service abstraction for simplicity and because we need
//! fine-grained control over tool lifecycle.

use super::client::{McpClient, McpClientConfig};
use super::protocol::{
    CallToolParams, CallToolResponse, InitializeRequest, InitializeResponse, JsonRpcRequest,
    JsonRpcResponse, ListToolsResponse, ToolDef,
};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

// ── MCP runtime client ────────────────────────────────────

/// Result of connecting to an MCP server.
#[derive(Debug)]
pub struct McpConnection {
    pub server_name: String,
    pub server_version: String,
    pub tools: Vec<ToolDef>,
}

/// Connect to an MCP server over stdio, perform the initialize handshake,
/// and discover tools. Returns the tools and server info.
pub async fn connect_stdio(config: &McpClientConfig) -> anyhow::Result<McpConnection> {
    let command = config
        .command
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Missing command for stdio transport"))?;

    let mut cmd = Command::new(command);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    cmd.kill_on_drop(true);

    if let Some(args) = &config.args {
        cmd.args(args);
    }
    if let Some(env) = &config.env {
        cmd.envs(env);
    }

    let mut child = cmd.spawn()?;
    let stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();

    let mut writer = tokio::io::BufWriter::new(stdin);
    let mut reader = BufReader::new(stdout);

    // ── Initialize ─────────────────────────────────────────
    let init_req = JsonRpcRequest::new(
        1,
        "initialize",
        Some(serde_json::to_value(InitializeRequest::default())?),
    );

    send_request(&mut writer, &init_req).await?;
    let init_resp: JsonRpcResponse = read_response(&mut reader).await?;

    let init_result: InitializeResponse =
        serde_json::from_value(init_resp.result.unwrap_or_default())?;

    // Send the "initialized" notification — raw JSON since it has no id
    send_raw(&mut writer, r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#).await?;

    // ── List tools ─────────────────────────────────────────
    let list_tools_req = JsonRpcRequest::new(2, "tools/list", None);

    send_request(&mut writer, &list_tools_req).await?;
    let list_resp: JsonRpcResponse = read_response(&mut reader).await?;
    let tools_result: ListToolsResponse =
        serde_json::from_value(list_resp.result.unwrap_or_default())?;

    // Clean up the child process
    drop(writer);
    drop(reader);
    let _ = child.start_kill();

    Ok(McpConnection {
        server_name: init_result.server_info.name,
        server_version: init_result.server_info.version,
        tools: tools_result.tools,
    })
}

/// Call a tool on an MCP server over stdio.
///
/// Spawns a new process for each call — simple and avoids persistent
/// connection state management.
pub async fn call_tool_stdio(
    config: &McpClientConfig,
    tool_name: &str,
    arguments: Value,
) -> anyhow::Result<CallToolResponse> {
    let command = config
        .command
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Missing command for stdio transport"))?;

    let mut cmd = Command::new(command);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    cmd.kill_on_drop(true);

    if let Some(args) = &config.args {
        cmd.args(args);
    }
    if let Some(env) = &config.env {
        cmd.envs(env);
    }

    let mut child = cmd.spawn()?;
    let stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();

    let mut writer = tokio::io::BufWriter::new(stdin);
    let mut reader = BufReader::new(stdout);

    // ── Initialize (quick handshake) ───────────────────────
    let init_req = JsonRpcRequest::new(
        1,
        "initialize",
        Some(serde_json::to_value(InitializeRequest::default())?),
    );

    send_request(&mut writer, &init_req).await?;
    read_response::<JsonRpcResponse>(&mut reader).await?;

    send_raw(&mut writer, r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#).await?;

    // ── Call tool ──────────────────────────────────────────
    let call_req = JsonRpcRequest::new(
        2,
        "tools/call",
        Some(serde_json::to_value(CallToolParams {
            name: tool_name.to_string(),
            arguments,
        })?),
    );

    send_request(&mut writer, &call_req).await?;
    let call_resp: JsonRpcResponse = read_response(&mut reader).await?;
    let result: CallToolResponse =
        serde_json::from_value(call_resp.result.unwrap_or_default())?;

    drop(writer);
    drop(reader);
    let _ = child.start_kill();

    Ok(result)
}

/// Convenience: connect and populate a McpClient with discovered tools.
pub async fn connect_and_populate(
    config: &McpClientConfig,
    client: &mut McpClient,
) -> anyhow::Result<()> {
    let conn = connect_stdio(config).await?;
    client.mark_connected(conn.server_name, conn.server_version, conn.tools);
    Ok(())
}

// ── I/O helpers ───────────────────────────────────────────

async fn send_request(
    writer: &mut (impl AsyncWriteExt + Unpin),
    req: &JsonRpcRequest,
) -> anyhow::Result<()> {
    let mut json = serde_json::to_string(req)?;
    json.push('\n');
    writer.write_all(json.as_bytes()).await?;
    writer.flush().await?;
    Ok(())
}

async fn send_raw(writer: &mut (impl AsyncWriteExt + Unpin), raw: &str) -> anyhow::Result<()> {
    writer.write_all(raw.as_bytes()).await?;
    writer.write_all(b"\n").await?;
    writer.flush().await?;
    Ok(())
}

async fn read_response<T: serde::de::DeserializeOwned>(
    reader: &mut (impl AsyncBufReadExt + Unpin),
) -> anyhow::Result<T> {
    let mut line = String::new();
    reader.read_line(&mut line).await?;
    if line.trim().is_empty() {
        anyhow::bail!("Empty response from MCP server");
    }
    Ok(serde_json::from_str(&line)?)
}

// ── Tests ─────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_connect_stdio_missing_command() {
        let config = McpClientConfig {
            name: "test".into(),
            transport: super::super::transport::TransportType::Stdio,
            command: None,
            args: None,
            url: None,
            env: None,
        };
        let result = connect_stdio(&config).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Missing command"));
    }

    #[tokio::test]
    async fn test_read_response_valid_json() {
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {"ok": true}
        })
        .to_string();
        let mut cursor = std::io::Cursor::new(payload + "\n");
        let resp: JsonRpcResponse = read_response(&mut cursor).await.unwrap();
        assert_eq!(resp.id, 1);
    }

    #[tokio::test]
    async fn test_send_request_formats_json_rpc() {
        let req = JsonRpcRequest::new(1, "tools/list", None);

        let mut buf: Vec<u8> = Vec::new();
        send_request(&mut buf, &req).await.unwrap();

        let sent = String::from_utf8(buf).unwrap();
        assert!(sent.contains("\"jsonrpc\":\"2.0\""));
        assert!(sent.contains("\"method\":\"tools/list\""));
        assert!(sent.ends_with('\n'));
    }
}
