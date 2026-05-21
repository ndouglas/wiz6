import { MessageGallery } from '../views/MessageGallery.js';

export function MsgPage() {
  return (
    <main style={{ padding: 'var(--space-5)', maxWidth: 1100, margin: '0 auto' }}>
      <h1>Messages</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Huffman-decompressed text from <code>msg.dbs</code>.
      </p>
      <MessageGallery url="/messages/msg.json" />
    </main>
  );
}
