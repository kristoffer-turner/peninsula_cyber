const PORTAL_ID = process.env.HUBSPOT_PORTAL_ID;
const FORM_ID = process.env.HUBSPOT_FORM_ID;
const PRIVATE_APP_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

const isFormsConfigured = () => Boolean(PORTAL_ID && FORM_ID);
const isContactsApiConfigured = () => Boolean(PRIVATE_APP_TOKEN);

// Submits a new signup to a HubSpot form so it shows up in HubSpot's native
// forms/contacts flow (list membership, workflows, etc. are handled in HubSpot).
async function submitToHubspotForm({ email, firstName, lastName, pageUri, pageName }) {
  if (!isFormsConfigured()) {
    return { skipped: true, reason: 'HubSpot forms integration is not configured' };
  }

  const url = `https://api.hsforms.com/submissions/v3/integration/submit/${PORTAL_ID}/${FORM_ID}`;
  const fields = [{ name: 'email', value: email }];
  if (firstName) fields.push({ name: 'firstname', value: firstName });
  if (lastName) fields.push({ name: 'lastname', value: lastName });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields,
      context: {
        pageUri: pageUri || '',
        pageName: pageName || 'Peninsula Cyber newsletter signup',
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HubSpot forms API responded ${response.status}: ${body}`);
  }

  return { skipped: false };
}

// Creates or updates a contact directly via the CRM API. Used by the admin
// panel to (re)sync a subscriber on demand, independent of the public form.
async function upsertContact({ email, firstName, lastName }) {
  if (!isContactsApiConfigured()) {
    return { skipped: true, reason: 'HubSpot private app token is not configured' };
  }

  const url = `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`;
  const properties = { email };
  if (firstName) properties.firstname = firstName;
  if (lastName) properties.lastname = lastName;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PRIVATE_APP_TOKEN}`,
    },
    body: JSON.stringify({ properties }),
  });

  if (response.status === 404) {
    const createResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PRIVATE_APP_TOKEN}`,
      },
      body: JSON.stringify({ properties }),
    });
    if (!createResponse.ok) {
      const body = await createResponse.text();
      throw new Error(`HubSpot contacts API responded ${createResponse.status}: ${body}`);
    }
    return { skipped: false, created: true };
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HubSpot contacts API responded ${response.status}: ${body}`);
  }

  return { skipped: false, created: false };
}

module.exports = {
  isFormsConfigured,
  isContactsApiConfigured,
  submitToHubspotForm,
  upsertContact,
};
