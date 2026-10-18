import { useProviderName } from "../api/hooks";

/** Badge showing which AI provider powers an employee (e.g. "GitHub Copilot", "Claude"). */
export function ProviderTag({ adapterType }: { adapterType: string }) {
  const name = useProviderName(adapterType);
  return (
    <span className="tag" title={`Powered by ${name} (${adapterType})`}>
      🧠 {name}
    </span>
  );
}
