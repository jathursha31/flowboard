import { Link } from 'react-router-dom';

// 🤷 Theriyaadha address ku vandhaa
export default function NotFoundPage() {
  return (
    <main className="page auth-page">
      <div className="card auth-card">
        <h1>404: Page not found</h1>
        <p>This page doesn't exist. It may have moved, or the link is wrong.</p>
        <Link to="/" className="btn btn--primary">Back to home</Link>
      </div>
    </main>
  );
}
