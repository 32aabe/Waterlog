import { relationshipDepth, markColor, markPresence } from "@/lib/spotVisual";
import {
  shapeFamilyForSpotType,
  conditionTreatment,
  birdMarkPlacements,
  illustrationGlow,
  type WaterShapeFamily,
} from "@/lib/spotIllustration";
import type { SpotSummary } from "../../../server/db";

type ActivityLevel = "None" | "Low" | "Medium" | "High";

type ShapeProps = {
  family: WaterShapeFamily;
  fill?: string;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
  filter?: string;
};

// The one silhouette per water type, centered on a 200×160 viewBox.
// Deliberately simple primitives (ellipse/circle/rect) for the more
// regular types and a couple of hand-drawn organic paths for the rest —
// a shape family, not a rendering of any specific real place.
function WaterShape({ family, ...rest }: ShapeProps) {
  switch (family) {
    case "oval-large":
      return <ellipse cx={100} cy={100} rx={72} ry={46} {...rest} />;
    case "circle-basin":
      return <circle cx={100} cy={96} r={50} {...rest} />;
    case "rounded-rect":
      return <rect x={42} y={60} width={116} height={72} rx={28} {...rest} />;
    case "channel":
      return <rect x={20} y={84} width={160} height={32} rx={16} {...rest} />;
    case "cluster":
      return (
        <g {...rest}>
          <ellipse cx={70} cy={98} rx={32} ry={22} />
          <ellipse cx={126} cy={108} rx={28} ry={19} />
          <ellipse cx={100} cy={76} rx={20} ry={15} />
        </g>
      );
    case "organic-medium":
      return (
        <path
          d="M58,100 C52,76 78,58 106,61 C136,64 152,86 146,110 C140,134 108,147 83,139 C60,132 64,120 58,100 Z"
          {...rest}
        />
      );
    case "organic-small":
    default:
      return (
        <path
          d="M70,103 C65,85 84,72 102,74 C123,76 133,93 128,109 C123,127 99,136 81,129 C67,123 73,117 70,103 Z"
          {...rest}
        />
      );
  }
}

// The Place Portrait's illustration — a symbolic shape standing for the
// kind of place, a fill treatment standing for how much water is there
// now, a few quiet marks standing for how much bird life shows up, a
// color carried straight from lib/spotVisual.ts's water-state palette
// standing for the place's current ecological condition, and a glow/
// presence standing for how deep the relationship has become. One
// composed scene, never a photo, never a legend of separate stats. See
// docs/design/06_SPOT_SCREEN.md.
export function SpotIllustration({
  spot,
  waterCondition,
  birdActivity,
}: {
  spot: SpotSummary;
  waterCondition: string | null | undefined;
  birdActivity: ActivityLevel;
}) {
  const depth = relationshipDepth(spot);
  const color = markColor(spot);
  const presence = markPresence(spot);
  const glow = illustrationGlow(depth);
  const family = shapeFamilyForSpotType(spot.spotType);
  const treatment = conditionTreatment(waterCondition);
  const birds = birdMarkPlacements(spot.id, birdActivity);
  const glowId = `spot-glow-${spot.id}`;

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[var(--water-mist)] to-[var(--water-mist-2)]">
      <svg viewBox="0 0 200 160" preserveAspectRatio="xMidYMid meet" className="h-full w-full" style={{ opacity: presence }}>
        <defs>
          <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={glow.blur} />
          </filter>
        </defs>

        {/* Halo — depth reads as a softer, richer glow around the shape,
            never as a bigger shape (docs/design/01_MAP_SCREEN.md). */}
        <WaterShape family={family} fill={color} opacity={glow.opacity} filter={`url(#${glowId})`} />

        {treatment === "dry" && (
          <>
            <WaterShape family={family} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.5} opacity={0.5} />
            <g stroke="var(--muted-foreground)" strokeWidth={1} opacity={0.35} strokeLinecap="round">
              <path d="M90,96 L97,112" />
              <path d="M108,100 L103,116" />
            </g>
          </>
        )}

        {treatment === "full" && <WaterShape family={family} fill={color} />}

        {/* Partial — the shape's outline stays visible at full size,
            with a smaller filled body inset toward the center: less
            water than the place can hold, not a different place. */}
        {treatment === "partial" && (
          <>
            <WaterShape family={family} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.5} opacity={0.4} />
            <g transform="translate(100,100) scale(0.6) translate(-100,-100)">
              <WaterShape family={family} fill={color} />
            </g>
          </>
        )}

        {/* Frozen family — the full water body plus a pale frost wash;
            partially frozen lets more of the water color show through. */}
        {(treatment === "frozen" || treatment === "partially_frozen") && (
          <>
            <WaterShape family={family} fill={color} />
            <WaterShape family={family} fill="white" opacity={treatment === "frozen" ? 0.45 : 0.22} />
          </>
        )}

        {treatment === "snow" && (
          <>
            <WaterShape family={family} fill={color} />
            <g fill="white" opacity={0.8}>
              <circle cx={82} cy={88} r={2.2} />
              <circle cx={96} cy={80} r={1.8} />
              <circle cx={112} cy={90} r={2} />
              <circle cx={104} cy={102} r={1.6} />
            </g>
          </>
        )}

        {/* Bird activity — a small number of quiet, generic marks, never
            a species and never a literal count (docs/design/
            06_SPOT_SCREEN.md, "Illustration Philosophy"). */}
        <g fill="none" stroke="var(--foreground)" strokeWidth={1.6} strokeLinecap="round" opacity={0.55}>
          {birds.map((p, i) => (
            <path key={i} d={`M${p.x - 5},${p.y} Q${p.x - 2},${p.y - 4} ${p.x},${p.y} Q${p.x + 2},${p.y - 4} ${p.x + 5},${p.y}`} />
          ))}
        </g>
      </svg>
    </div>
  );
}
