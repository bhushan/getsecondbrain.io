/** Line icons for the navigation, drawn on a 24px grid in the map's own vocabulary of dots and links. */

const paths = {
  map: (
    <>
      <circle cx="6" cy="16" r="3" />
      <circle cx="17" cy="7" r="2.5" />
      <circle cx="18" cy="18" r="1.8" />
      <path d="M8.4 14.2 15 8.6M8.9 16.6l7.3 1.1" />
    </>
  ),
  import: (
    <>
      <path d="M12 4v10M7.5 9.5 12 14l4.5-4.5" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </>
  ),
  connect: (
    <>
      <path d="M9 7V4M15 7V4" />
      <path d="M6.5 7h11v4a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 16.5V20" />
    </>
  ),
  activity: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M10 4h4" />
      <path d="M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  shuffle: (
    <>
      <circle cx="6" cy="7" r="2" />
      <circle cx="18" cy="9" r="2" />
      <circle cx="10" cy="18" r="2" />
      <path d="M8 7.4l8 1.2M16.7 10.6l-5.4 5.8" />
    </>
  ),
  signout: (
    <>
      <path d="M14 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
