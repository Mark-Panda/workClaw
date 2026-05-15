# Database Schema

## Status: Phase 1 (Complete)

## Overview

SQLite database (switchable to PostgreSQL via DATABASE_URL) with 13 tables and 12 indexes. All primary keys use UUID v4 strings.

## Technology

- **Driver**: sqlx 0.8 (async, compile-time SQL verification)
- **Default DB**: SQLite (zero-config)
- **Production option**: PostgreSQL (change DATABASE_URL)
- **Migration**: `001_initial.sql` embedded at compile time

## Tables

### users
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| username | TEXT | UNIQUE, NOT NULL |
| email | TEXT | UNIQUE, NOT NULL |
| password_hash | TEXT | NOT NULL (Argon2id) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### agents
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | NOT NULL |
| description | TEXT | |
| config_json | TEXT | NOT NULL (JSON: model, system_prompt, temperature, max_tokens) |
| status | TEXT | DEFAULT 'stopped' (stopped/running/error) |
| user_id | TEXT | REFERENCES users(id) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### agent_skills
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| agent_id | TEXT | REFERENCES agents(id) ON DELETE CASCADE |
| skill_name | TEXT | NOT NULL |
| skill_path | TEXT | |
| config_json | TEXT | |
| enabled | INTEGER | DEFAULT 1 |

### agent_mcp_servers
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| agent_id | TEXT | REFERENCES agents(id) ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| transport | TEXT | NOT NULL (stdio/sse) |
| command | TEXT | |
| args_json | TEXT | |
| url | TEXT | |
| env_json | TEXT | |
| enabled | INTEGER | DEFAULT 1 |

### rule_chains
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | NOT NULL |
| description | TEXT | |
| dsl_json | TEXT | NOT NULL (JSON DSL) |
| canvas_json | TEXT | (Flowgram ECS state) |
| version | INTEGER | DEFAULT 1 |
| status | TEXT | DEFAULT 'draft' (draft/active/archived) |
| user_id | TEXT | REFERENCES users(id) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### rule_execution_logs
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| chain_id | TEXT | REFERENCES rule_chains(id) |
| status | TEXT | NOT NULL (running/completed/failed) |
| input_json | TEXT | |
| output_json | TEXT | |
| error | TEXT | |
| started_at | TIMESTAMP | |
| completed_at | TIMESTAMP | |
| duration_ms | INTEGER | |
| user_id | TEXT | REFERENCES users(id) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### rule_node_executions
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| execution_id | TEXT | REFERENCES rule_execution_logs(id) |
| node_id | TEXT | NOT NULL |
| node_type | TEXT | NOT NULL |
| input_json | TEXT | |
| output_json | TEXT | |
| error | TEXT | |
| started_at | TIMESTAMP | |
| completed_at | TIMESTAMP | |
| duration_ms | INTEGER | |

### conversations
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| title | TEXT | |
| agent_id | TEXT | REFERENCES agents(id) |
| user_id | TEXT | REFERENCES users(id) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### messages
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| conversation_id | TEXT | REFERENCES conversations(id) ON DELETE CASCADE |
| role | TEXT | NOT NULL (user/assistant/system/tool) |
| content | TEXT | NOT NULL |
| tool_calls_json | TEXT | |
| tool_call_id | TEXT | |
| token_count | INTEGER | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### kanban_boards
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | NOT NULL |
| description | TEXT | |
| user_id | TEXT | REFERENCES users(id) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### kanban_columns
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| board_id | TEXT | REFERENCES kanban_boards(id) ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| position | INTEGER | NOT NULL |
| color | TEXT | DEFAULT '#6366f1' |
| wip_limit | INTEGER | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### kanban_tasks
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| column_id | TEXT | REFERENCES kanban_columns(id) ON DELETE CASCADE |
| title | TEXT | NOT NULL |
| description | TEXT | |
| priority | TEXT | DEFAULT 'medium' (low/medium/high/critical) |
| assignee | TEXT | |
| labels_json | TEXT | |
| due_date | TIMESTAMP | |
| position | INTEGER | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### logs
| Column | Type | Constraints |
|--------|------|-------------|
| id | TEXT | PRIMARY KEY |
| level | TEXT | NOT NULL (debug/info/warn/error) |
| source | TEXT | NOT NULL |
| message | TEXT | NOT NULL |
| context_json | TEXT | |
| user_id | TEXT | REFERENCES users(id) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

## Indexes (12)

```sql
agents(user_id)
agent_skills(agent_id)
rule_chains(user_id)
rule_execution_logs(chain_id)
rule_execution_logs(user_id)
conversations(user_id)
conversations(agent_id)
messages(conversation_id)
kanban_columns(board_id)
kanban_tasks(column_id)
logs(level)
logs(source)
logs(created_at)
```

## ER Diagram (Key Relations)

```
users 1──N agents
users 1──N rule_chains
users 1──N conversations
users 1──N kanban_boards
users 1──N logs

agents 1──N agent_skills
agents 1──N agent_mcp_servers
agents 1──N conversations

rule_chains 1──N rule_execution_logs
rule_execution_logs 1──N rule_node_executions

conversations 1──N messages

kanban_boards 1──N kanban_columns
kanban_columns 1──N kanban_tasks
```
