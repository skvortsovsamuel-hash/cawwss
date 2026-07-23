import { useEffect, useState } from "react";
import { api } from "../lib/api";

// Fallback SVG crest — matches unity/community ideology
const FallbackCrest = ({ size = 96 }) => (
  <svg viewBox="0 0 120 120" width={size} height={size} data-testid="crest-svg">
    <defs>
      <radialGradient id="crestBg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFFDF7"/>
        <stop offset="100%" stopColor="#F5F5F0"/>
      </radialGradient>
    </defs>
    <circle cx="60" cy="60" r="58" fill="url(#crestBg)" stroke="#0B1D36" strokeWidth="2"/>
    <circle cx="60" cy="60" r="52" fill="none" stroke="#D4AF37" strokeWidth="0.75"/>
    {/* Four figures in unity around center */}
    {[0, 90, 180, 270].map((angle) => (
      <g key={angle} transform={`rotate(${angle} 60 60)`}>
        <circle cx="60" cy="30" r="5" fill="#0B1D36"/>
        <path d="M 52 42 Q 60 36 68 42 L 68 50 Q 60 46 52 50 Z" fill="#0B1D36"/>
      </g>
    ))}
    {/* Central star of unity */}
    <circle cx="60" cy="60" r="8" fill="#D4AF37"/>
    <path d="M 60 54 L 62 60 L 66 60 L 63 63 L 64 68 L 60 65 L 56 68 L 57 63 L 54 60 L 58 60 Z"
          fill="#0B1D36" transform="translate(0,-1)"/>
  </svg>
);

export default function Crest({ size = 96 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let mounted = true;
    api.get("/branding/logo").then((r) => {
      if (mounted && r.data?.data) setSrc(`data:image/png;base64,${r.data.data}`);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  if (src) {
    return <img src={src} alt="CAWS crest" style={{ width: size, height: size, borderRadius: "50%" }} data-testid="crest-image"/>;
  }
  return <FallbackCrest size={size} />;
}
