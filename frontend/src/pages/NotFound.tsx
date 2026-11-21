import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="px-4 py-24 text-center">
      <h1 className="font-heading font-bold text-4xl">404</h1>
      <p className="mt-2 text-muted-foreground">Oops! Page not found</p>
      <Link to="/" className="mt-6 inline-block text-primary underline">Return to Home</Link>
    </div>
  );
}
