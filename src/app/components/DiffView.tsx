export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");

  return (
    <pre className="font-display text-xs leading-relaxed rounded-lg border border-sc-border bg-sc-surface overflow-x-auto p-4">
      {lines.map((line, i) => {
        let color = "text-sc-muted";
        let bg = "";
        if (line.startsWith("+") && !line.startsWith("+++")) {
          color = "text-sc-pass";
          bg = "bg-[color:var(--sc-pass)]/10";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          color = "text-sc-critical";
          bg = "bg-[color:var(--sc-critical)]/10";
        } else if (line.startsWith("@@")) {
          color = "text-sc-accent";
        } else if (line.startsWith("+++") || line.startsWith("---")) {
          color = "text-sc-text";
        }
        return (
          <div key={i} className={`${color} ${bg} px-2 -mx-2 whitespace-pre`}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}
