import { Link } from "react-router-dom";
import { useT } from "../i18n";

export default function NotFound() {
  const { t } = useT();
  return (
    <div className="px-4 py-24 text-center">
      <h1 className="font-heading font-bold text-4xl">404</h1>
      <p className="mt-2 text-muted-foreground">{t("Oops! Page not found")}</p>
      <Link to="/" className="mt-6 inline-block text-primary underline">{t("Return to Home")}</Link>
    </div>
  );
}
