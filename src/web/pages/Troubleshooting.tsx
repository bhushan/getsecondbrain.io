/** Answers to the problems people hit while connecting, as an accordion. */
export function Troubleshooting({ url }: { url: string }) {
  const items = [
    {
      question: "The app says it cannot connect or finds no server",
      answer: (
        <>
          Check the address is exactly <code>{url}</code>, including <code>/mcp</code> at the end. Choose the HTTP or Streamable HTTP type if the app asks,
          not SSE.
        </>
      ),
    },
    {
      question: "\"This account is not on the list yet\"",
      answer: <>Sign-up is by invitation right now. Sign in with the Google account that has access, or ask for an invitation at hello@getsecondbrain.io.</>,
    },
    {
      question: "The sign-in window closed or showed \"This sign-in link expired\"",
      answer: <>Start the connection again from the app. Allow pop-ups for the app if your browser blocked the window.</>,
    },
    {
      question: "Connected, but the app never uses Second Brain",
      answer: <>Switch the connector or its tools on for the chat, and add the only-memory rule from your app's steps above. Until then, name Second Brain in your request.</>,
    },
    {
      question: "The app can read but not save",
      answer: <>It was connected read only. Disconnect it below, connect again, and keep "Create and edit notes" ticked. Some ChatGPT plans only allow reading.</>,
    },
    {
      question: "It worked, then asks to sign in again",
      answer: <>The app was disconnected here or its sign-in expired. Choose Connect (or Authenticate) in the app again.</>,
    },
  ];
  return (
    <div className="accordion">
      {items.map((item) => (
        <details key={item.question}>
          <summary>
            <span>{item.question}</span>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
