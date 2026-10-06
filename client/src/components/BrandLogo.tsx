type BrandLogoProps = { compact?: boolean };
const LOGO_SRC = "/adwam-logo.png";
export default function BrandLogo({ compact = false }: BrandLogoProps) {
  return <span className={`logo-lockup ${compact ? "logo-lockup-compact" : ""}`} aria-label="أدوم"><span className="logo-symbol" aria-hidden="true"><img className="logo-art" src={LOGO_SRC} alt="" /></span>{!compact && <span className="logo-wordmark"><strong>أدوم</strong><small>لحفظٍ يدوم</small></span>}</span>;
}
