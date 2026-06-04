type QuickPasteReplyProps = {
  disabled: boolean;
  onReply: (value: string) => Promise<void>;
};

export function QuickPasteReply({ disabled, onReply }: QuickPasteReplyProps) {
  return (
    <textarea
      className="quick-paste"
      rows={1}
      disabled={disabled}
      placeholder={disabled ? 'Sending...' : 'Paste here to send'}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
        }
      }}
      onPaste={async (event) => {
        event.stopPropagation();
        const pasted = event.clipboardData.getData('text');
        if (!pasted.trim()) {
          event.preventDefault();
          return;
        }

        // This is not a normal textarea. It is a delivery slot for replies
        // composed in another editor, so paste is the commit action. The full
        // reply panel covers in-place drafting and review.
        event.preventDefault();
        await onReply(pasted);
      }}
    />
  );
}
