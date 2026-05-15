import type { KeyboardEvent } from 'react';
import Button from '../../../components/common/Button';

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  disabled?: boolean;
}

export default function ChatInput({ value, onChange, onSend, onKeyDown, disabled }: ChatInputProps) {
  return (
    <div className="flex gap-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder="Type a message..."
        rows={2}
        className="input-field resize-none"
      />
      <Button onClick={onSend} disabled={disabled}>
        Send
      </Button>
    </div>
  );
}
