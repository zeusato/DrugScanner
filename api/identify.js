import https from 'https';

/**
 * A simple helper around the built‑in fetch. Vercel functions run on Node 18+
 * which includes global fetch, but older Node versions may not. To be safe
 * this helper always falls back to https if fetch is unavailable.
 * @param {string} url
 * @returns {Promise<{status: number, json: () => Promise<any>} | any>}
 */
function doFetch(url) {
  if (typeof fetch !== 'undefined') {
    return fetch(url);
  }
  // Fallback for environments without native fetch support
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          async json() {
            try {
              return JSON.parse(data);
            } catch (err) {
              return {};
            }
          },
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Compose a response object from the openFDA API results. Extracts
 * common fields such as active ingredients, indications, dosage
 * instructions and warnings. This function makes a best effort to
 * normalize the fields while preserving the original text. It may
 * return undefined if the result structure is not recognized.
 *
 * @param {any} result The raw result object from openFDA
 * @returns {object | undefined}
 */
function mapOpenFdaResult(result) {
  if (!result) return undefined;
  const drug = {};
  // openfda section contains harmonized fields
  const of = result.openfda || {};
  drug.brand_name = of.brand_name ? of.brand_name[0] : undefined;
  drug.generic_name = of.generic_name ? of.generic_name[0] : undefined;
  drug.ndc = of.product_ndc ? of.product_ndc[0] : undefined;
  drug.route = of.route ? of.route[0] : undefined;
  drug.dosage_form = of.dosage_form ? of.dosage_form[0] : undefined;
  drug.active_ingredients = result.active_ingredient || result.active_ingredients;
  drug.indications = result.indications_and_usage || result.indications || undefined;
  drug.dosage = result.dosage_and_administration || undefined;
  drug.warnings = result.warnings_and_cautions || result.warnings || undefined;
  drug.adverse_reactions = result.adverse_reactions || undefined;
  drug.information_for_patients = result.information_for_patients || undefined;
  return drug;
}

/**
 * Handle POST requests to identify a drug. It expects the request body
 * to contain an object with an `identity` field extracted by the
 * client‑side Gemini prompt and an optional `barcode`. The handler
 * attempts to look up the drug in the openFDA API using the provided
 * identifiers. If nothing is found in openFDA it returns Not_Found.
 *
 * The response format:
 * {
 *   status: 'OK' | 'Not_Found',
 *   drug: { ...fields... },
 *   sources: [ { name: string, url: string } ]
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  // Read the body. Vercel automatically parses JSON when the
  // appropriate header is set, but to be safe we manually buffer.
  let body = '';
  await new Promise((resolve) => {
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', resolve);
  });
  let data;
  try {
    data = JSON.parse(body || '{}');
  } catch (err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const identity = data.identity || {};
  const barcode = data.barcode || '';
  const sources = [];
  let drug;

  // Determine search query. Prefer NDC when available.
  let queryUrl;
  // If a numeric barcode (length 10–14) is provided, treat it as product code
  const digitsOnly = barcode.replace(/[^0-9]/g, '');
  if (identity.ndc || identity.product_ndc) {
    const ndc = identity.ndc || identity.product_ndc;
    queryUrl = `https://api.fda.gov/drug/ndc.json?search=product_ndc:${encodeURIComponent(ndc)}&limit=1`;
  } else if (digitsOnly && (digitsOnly.length === 10 || digitsOnly.length === 11 || digitsOnly.length === 12)) {
    // NDC codes can be 10 or 11 digits; treat 12 as UPC which may map to NDC via openFDA harmonization
    queryUrl = `https://api.fda.gov/drug/ndc.json?search=product_ndc:${encodeURIComponent(digitsOnly)}&limit=1`;
  } else if (identity.brand_name || identity.generic_name) {
    // Build a search string for the label endpoint using brand and dosage form.
    const parts = [];
    if (identity.brand_name) parts.push(`openfda.brand_name.exact:\"${identity.brand_name}\"`);
    if (identity.generic_name) parts.push(`openfda.generic_name.exact:\"${identity.generic_name}\"`);
    if (identity.dosage_form) parts.push(`openfda.dosage_form.exact:\"${identity.dosage_form}\"`);
    // join with +AND+
    const search = parts.join('+AND+');
    queryUrl = `https://api.fda.gov/drug/label.json?search=${search}&limit=1`;
  }

  if (queryUrl) {
    try {
      const resp = await doFetch(queryUrl);
      if (resp && resp.status === 200) {
        const json = await resp.json();
        const results = json.results || [];
        if (results && results.length > 0) {
          // use the first result
          drug = mapOpenFdaResult(results[0]);
          sources.push({ name: 'openFDA', url: queryUrl });
        }
      }
    } catch (err) {
      // Swallow fetch errors; fall through to Not_Found
      console.error('openFDA fetch error', err);
    }
  }

  // If we did not find anything, return Not_Found. Future enhancements
  // could call additional APIs or perform a trusted web search here.
  if (!drug) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'Not_Found' }));
    return;
  }

  // Otherwise return OK with the drug details and source list.
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ status: 'OK', drug, sources }));
}