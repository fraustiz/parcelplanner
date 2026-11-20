/**
 * Applies the saved theme before the first paint. A raw script in the head,
 * not an effect: effects run after paint, so light mode would flash dark.
 * Falls back to the operating system's preference on a first visit.
 */
export default function ThemeScript() {
  const script = `(function(){try{
    var saved = localStorage.getItem('parcelplanner.theme');
    var system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = saved === 'light' || saved === 'dark' ? saved : system;
  }catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
