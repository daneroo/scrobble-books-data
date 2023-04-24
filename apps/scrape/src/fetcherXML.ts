// fetch a page as xml
export async function fetcherXML(URI: string, qs = {}) {
  const qss = new URLSearchParams(qs).toString();
  const url = `${URI}?${qss}`;
  const response = await fetch(url);
  const asXML = await response.text();
  return asXML;
}
