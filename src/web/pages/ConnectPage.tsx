import { useEffect, useState } from "react";
import { api, type Connection, type Me } from "../api";
import { connectGuides, TRY_PROMPTS } from "../connectGuides";
import { AppMark } from "./AppMark";
import { ConnectedApps } from "./ConnectedApps";
import { CopyButton } from "./CopyButton";
import { GuideSteps } from "./GuideSteps";
import { Troubleshooting } from "./Troubleshooting";

const GUIDE_KEY = "sb.connect-app";

function readGuide(): string {
  try {
    return localStorage.getItem(GUIDE_KEY) ?? "claude";
  } catch {
    return "claude";
  }
}

export function ConnectPage({ me }: { me: Me }) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const load = () => void api.connections().then(({ connections }) => setConnections(connections));
  useEffect(load, []);
  const url = me.mcpUrl;
  const guides = connectGuides(url);
  const [active, setActive] = useState(readGuide);
  const guide = guides.find((item) => item.id === active) ?? guides[0]!;
  const choose = (id: string) => {
    setActive(id);
    try {
      localStorage.setItem(GUIDE_KEY, id);
    } catch {
      /* the choice just is not remembered */
    }
  };
  const connected = connections?.length ?? 0;

  return (
    <main className="page page-connect">
      <section className="connect-hero" aria-labelledby="connect-title">
        <div className="connect-hero-glow" aria-hidden="true" />
        <p className="pg-eyebrow">Connect</p>
        <h1 id="connect-title">Connect any AI app or agent</h1>
        <p className="pg-lede">
          Chat apps, code editors and terminal agents, on any device, all connect with the same address. Once connected, an app can search your notes,
          read them and save new ones, but only in the workspace you choose, and it can never delete anything.
        </p>
        <div className="address-card">
          <span className="address-label">Your connection address</span>
          <div className="address-row">
            <code>{url}</code>
            <CopyButton text={url} label="Copy address" className="pg-btn pg-btn-primary pg-btn-lg" />
          </div>
          <p>The same address works for every app. You only need to sign in to Second Brain when the app asks.</p>
        </div>
        <div className="hero-foot">
          <ul className="hero-logos" aria-label="Works with">
            {guides.map((item) => (
              <li key={item.id} title={item.name}>
                <AppMark id={item.id} size="sm" />
                <span className="sr-only">{item.name}</span>
              </li>
            ))}
          </ul>
          {connections !== null && (
            <a className="pg-pill hero-status" href="#connected-apps" data-on={connected > 0 || undefined}>
              <span className="status-dot" aria-hidden="true" />
              {connected === 0 ? "No apps connected yet" : connected === 1 ? "1 app connected" : `${connected} apps connected`}
            </a>
          )}
        </div>
      </section>

      <section className="pg-section" aria-labelledby="flow-title">
        <h2 id="flow-title">How connecting works</h2>
        <ol className="flow-cards">
          <li>
            <span className="flow-num">1</span>
            <p>Add the address above to your app, using the steps for that app below.</p>
          </li>
          <li>
            <span className="flow-num">2</span>
            <p>The app opens a Second Brain page. Sign in with Google, choose a workspace, and choose whether the app may create and edit notes.</p>
          </li>
          <li>
            <span className="flow-num">3</span>
            <p>Choose Connect. The app now has Second Brain tools, and it shows up under Connected apps at the bottom of this page.</p>
          </li>
        </ol>
      </section>

      <section className="pg-section" aria-labelledby="apps-heading">
        <h2 id="apps-heading">Pick your app</h2>
        <div className="app-grid" role="tablist" aria-labelledby="apps-heading">
          {guides.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={item.id === guide.id}
              aria-controls="guide-panel"
              className="app-tile"
              onClick={() => choose(item.id)}
            >
              <AppMark id={item.id} />
              <span className="app-tile-text">
                <strong>{item.name}</strong>
                <span>{item.where}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="guide-card" role="tabpanel" id="guide-panel" aria-labelledby={`tab-${guide.id}`}>
          <div className="guide-head">
            <AppMark id={guide.id} size="lg" />
            <div>
              <h3>{guide.name}</h3>
              <p>{guide.where}</p>
            </div>
          </div>
          {guide.note && <p className="callout">{guide.note}</p>}
          <GuideSteps steps={guide.steps} />
          <div className="guide-memory">
            <h3>Make Second Brain its only memory</h3>
            <p className="pg-muted">
              Connecting gives {guide.name} the tools; this rule tells it to use them every time. It searches Second Brain before answering anything about
              you, saves what you tell it there, and stops keeping a separate memory of its own.
            </p>
            <GuideSteps steps={guide.memory} />
          </div>
        </div>
      </section>

      <section className="pg-section" aria-labelledby="consent-title">
        <h2 id="consent-title">On the Second Brain page</h2>
        <dl className="consent-grid">
          <div>
            <dt>Workspace it can use</dt>
            <dd>The app sees only this workspace. To give an app a different workspace, disconnect it and connect again.</dd>
          </div>
          <div>
            <dt>Search and read notes</dt>
            <dd>Always on. The app can search, open notes, follow links and list tags.</dd>
          </div>
          <div>
            <dt>Create and edit notes</dt>
            <dd>
              Untick it for read only. When ticked, the app can save new notes, add to notes and link them. Every change keeps the earlier version, and apps
              can never delete or trash a note.
            </dd>
          </div>
        </dl>
      </section>

      <section className="pg-section" aria-labelledby="try-title">
        <h2 id="try-title">Try it</h2>
        <p className="pg-muted">Ask your app something like this. Naming Second Brain helps the app pick the right tool.</p>
        <ul className="prompt-list">
          {TRY_PROMPTS.map((prompt) => (
            <li key={prompt}>
              <span>{prompt}</span>
              <CopyButton text={prompt} className="pg-btn pg-btn-sm pg-btn-ghost" />
            </li>
          ))}
        </ul>
        <p className="pg-muted">Notes an app saves appear on the map straight away, and every action is listed under Activity.</p>
      </section>

      <section className="pg-section" aria-labelledby="help-title">
        <h2 id="help-title">If something goes wrong</h2>
        <Troubleshooting url={url} />
      </section>

      <section className="pg-section" id="connected-apps" aria-labelledby="connected-title">
        <h2 id="connected-title">Connected apps</h2>
        <ConnectedApps connections={connections} reload={load} />
      </section>
    </main>
  );
}
