// Each navigation fades in: a flat cross-fade in CSS (no movement, nothing for the main
// thread to run), short enough never to hold up a tap. Off with reduced motion.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
