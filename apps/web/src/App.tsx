const highlights = [
  "Real-time collaborative play",
  "Split deployment topology",
  "Scaffold ready for rooms, sessions, and pieces"
];

export function App() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">SquadPuzzle</p>
        <h1>SquadPuzzle — Coming Soon</h1>
        <p className="lead">
          A real-time collaborative jigsaw puzzle platform with a React front end,
          stateless API services, and a dedicated WebSocket gateway.
        </p>

        <ul className="highlights" aria-label="Project highlights">
          {highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>

        <div className="status-row">
          <span className="status-dot" aria-hidden="true" />
          <span>Monorepo scaffold initialized</span>
        </div>
      </section>
    </main>
  );
}