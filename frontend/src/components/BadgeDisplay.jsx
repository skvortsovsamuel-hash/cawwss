import { Trees, PawPrint, Heart, BookOpen, Home, Users, ShieldAlert, Palette, Award } from "lucide-react";

const CATEGORY_ICON = {
  cat_environment: Trees,
  cat_animals: PawPrint,
  cat_health: Heart,
  cat_education: BookOpen,
  cat_community: Home,
  cat_elderly: Users,
  cat_disaster: ShieldAlert,
  cat_arts: Palette,
};

function TierShield({ color, label }) {
  return (
    <svg width="52" height="60" viewBox="0 0 52 60" xmlns="http://www.w3.org/2000/svg" aria-label={label}>
      <defs>
        <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color}/>
          <stop offset="100%" stopColor={color} stopOpacity="0.75"/>
        </linearGradient>
      </defs>
      <path d="M26 2 L48 10 L48 30 Q48 48 26 58 Q4 48 4 30 L4 10 Z" fill={`url(#g-${label})`} stroke="#0B1D36" strokeWidth="1.5"/>
      <path d="M26 20 L30 28 L38 29 L32 35 L34 43 L26 39 L18 43 L20 35 L14 29 L22 28 Z" fill="#FFFDF7" opacity="0.95"/>
    </svg>
  );
}

function CategoryBadge({ badge }) {
  const Icon = CATEGORY_ICON[badge.id] || Award;
  const earned = badge.earned_at ? new Date(badge.earned_at).toLocaleDateString() : "";
  const tooltip = `${badge.label} — first earned ${earned || "recently"}${badge.hours ? ` · ${badge.hours}h in ${badge.cause}` : ""}`;
  return (
    <div className="group relative flex flex-col items-center" data-testid={`badge-${badge.id}`}>
      <div className="w-12 h-12 rounded-full bg-teal/10 border-2 border-teal flex items-center justify-center text-teal">
        <Icon size={22}/>
      </div>
      <div className="text-[10px] mt-1 text-navy font-medium max-w-[80px] text-center leading-tight">{badge.label}</div>
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-navy text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
        {tooltip}
      </div>
    </div>
  );
}

export default function BadgeDisplay({ tierBadges = [], categoryBadges = [] }) {
  const topTier = tierBadges.length ? tierBadges[tierBadges.length - 1] : null;

  if (!topTier && categoryBadges.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm" data-testid="no-badges">
        Log verified hours to earn your first badge.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {topTier && (
        <div className="flex items-center gap-4">
          <TierShield color={topTier.color} label={topTier.label}/>
          <div>
            <div className="font-serif text-lg text-navy" data-testid="tier-badge-label">{topTier.label}</div>
            <div className="text-sm text-gray-600">{topTier.description}</div>
            {tierBadges.length > 1 && (
              <div className="flex gap-1 mt-2">
                {tierBadges.slice(0, -1).map(t => (
                  <div key={t.id} title={t.label}
                       className="w-3 h-3 rounded-full border border-navy/30"
                       style={{ background: t.color }}/>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {categoryBadges.length > 0 && (
        <div>
          <div className="text-xs tracking-widest uppercase text-gray-500 mb-3">Causes served</div>
          <div className="flex flex-wrap gap-4">
            {categoryBadges.map(b => <CategoryBadge key={b.id} badge={b}/>)}
          </div>
        </div>
      )}
    </div>
  );
}
