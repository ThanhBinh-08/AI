/**
 * One press of a deal button: the deal's own page opens in a new tab (it shows the code in a popup, because of #get)
 * and the tab that was pressed goes to the store through /go/<brandId>/. Call it inside the click handler, so no
 * pop-up blocker objects. Returns false when the tab was blocked; then nothing has left the page and the caller
 * shows the code in place.
 */
export function openDealTab(slug: string, goUrl: string): boolean {
  const tab = window.open(`/deals/${encodeURIComponent(slug)}/#get`, "_blank");
  if (!tab) return false;
  tab.opener = null;
  window.location.href = goUrl;
  return true;
}
