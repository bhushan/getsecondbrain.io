import { api, type Connection } from "../api";
import { AppMark } from "./AppMark";
import { logoIdFor } from "./appForName";
import { when } from "./when";

/** Older grants stored seconds; newer ones milliseconds. */
const createdMs = (createdAt: number) => createdAt * (createdAt < 1e12 ? 1000 : 1);

/** The apps that hold access to this account, each with a way to take it back. */
export function ConnectedApps({ connections, reload }: { connections: Connection[] | null; reload(): void }) {
  return (
    <>
      {connections === null && <p className="muted">Loading…</p>}
      {connections?.length === 0 && (
        <div className="empty-card">
          <AppMark id={undefined} />
          <p>Nothing connected yet. Follow the steps above, then come back here.</p>
        </div>
      )}
      {connections && connections.length > 0 && (
        <ul className="list-card">
          {connections.map((connection) => (
            <li key={connection.id}>
              <AppMark id={logoIdFor(connection)} />
              <div className="list-text">
                <strong>{connection.app}</strong>
                <span>
                  {connection.workspaceName ?? "Unknown workspace"}, {connection.canWrite ? "can read and write" : "read only"}, since {when(createdMs(connection.createdAt))}
                </span>
              </div>
              <button type="button" className="danger btn-sm" onClick={() => void api.disconnect(connection.id).then(reload)}>
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}
      {connections !== null && (
        <button type="button" className="link" onClick={reload}>
          Refresh the list
        </button>
      )}
    </>
  );
}
