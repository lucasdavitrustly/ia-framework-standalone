interface SourceTagProps {
  source: 'ast' | 'llm';
}

const styles = {
  ast: 'bg-blue-900/50 text-blue-300',
  llm: 'bg-purple-900/50 text-purple-300',
} as const;

export default function SourceTag({ source }: SourceTagProps) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${styles[source]}`}>
      {source.toUpperCase()}
    </span>
  );
}
