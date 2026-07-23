import { useNavigate } from "react-router-dom";

export default function BackLink({ to = -1, label = "Back", testId = "back-link" }) {
  const nav = useNavigate();
  const go = () => {
    if (to === -1) nav(-1);
    else nav(to);
  };
  return (
    <button
      type="button"
      onClick={go}
      data-testid={testId}
      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-navy transition-colors"
    >
      <span aria-hidden="true">←</span> {label}
    </button>
  );
}
