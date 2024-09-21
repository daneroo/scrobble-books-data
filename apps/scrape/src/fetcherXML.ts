// fetch a page as xml
export async function fetcherXML(URI: string, qs = {}) {
  const qss = new URLSearchParams(qs).toString();
  const url = `${URI}?${qss}`;
  console.log(`-- fetching: ${url}`);

  const maxRetries = 10;
  // backoff and rate limiting: sleep 1000ms+ attempt*1000ms
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // linear backoff for sleep
    const sleepMS = (attempt + 1) * 1000;
    await new Promise((resolve) => setTimeout(resolve, sleepMS));
    console.log(`  -- slept for ${sleepMS}`);

    const response = await fetch(url);
    if (response.status !== 200) {
      console.log(`  -- attempt: ${attempt} code: ${response.status}`);
      // linear backoff for sleep

      continue;
    }

    const asXML = await response.text();
    return asXML;
  }
  return "";
}
