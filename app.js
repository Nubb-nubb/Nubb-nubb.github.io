const apiKey = "AIzaSyDKGdFy5jC9WCwk6zjAgQQZ8Q1PgfB9Y0A";
const clientId = "183468814376-1chtrl8jfplol2effjelo0lkt10c5t9p.apps.googleusercontent.com";

// Initialize GIS and GAPI
let tokenClient;

window.onload = function () {
  // Load GAPI
  gapi.load('client', () => {
    console.log("GAPI loaded!");
    gapi.client.init({
      apiKey: apiKey, // Use the real variable
      discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest"]
    }).then(() => {
      console.log("Gmail API Initialized!");
    }).catch(error => console.error("Error initializing GAPI:", error));
  });

  // Initialize GIS Token Client
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId, // Use the real variable
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    callback: (response) => {
        if (response.error) {
            console.error("OAuth token request failed:", response);
            alert("Authorization failed. Please try again.");
            return;
        }
        console.log("OAuth token granted:", response);
        listSubscriptions();
    },
  });

  // Add click event to "Authorize" button
  document.getElementById("authorize").onclick = handleAuthClick;
};

// Handle Authorization Click
function handleAuthClick() {
  console.log("Authorize button clicked!");
  tokenClient.requestAccessToken(); // Request OAuth token
}

// List Subscriptions
function listSubscriptions() {
  const subscriptionsContainer = document.getElementById("subscriptions-container");
  subscriptionsContainer.style.display = "block";
  
  gapi.client.gmail.users.messages.list({
    userId: 'me',
    q: 'unsubscribe'
  }).then(response => {
    const messages = response.result.messages || [];
    const subscriptionsDiv = document.getElementById("subscriptions");

    subscriptionsDiv.innerHTML = "<h2>Your Subscriptions:</h2>";
    if (messages.length === 0) {
      subscriptionsDiv.innerHTML += "<p>No subscriptions found.</p>";
      return;
    }

    // Group subscriptions by company
    const groupedSubscriptions = {};
    processMessagesInBatches(messages, 10, 500, groupedSubscriptions, subscriptionsDiv) // Batch size: 10, Delay: 500ms
      .then(() => {
        console.log("All messages processed.");
      })
      .catch(error => console.error("Error processing messages:", error));
  }).catch(error => console.error("Error fetching messages:", error));
}


// Helper function to extract company name from "From" field
function extractCompanyName(fromField) {
  const match = fromField.match(/@([\w.-]+)/); // Extract domain (e.g., staples.com)
  if (match && match[1]) {
    const domainParts = match[1].split('.');
    return domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1); // Capitalize the domain
  }
  return "Unknown Company";
}

// Render grouped subscriptions with dropdowns
function renderGroupedSubscriptions(groupedSubscriptions, subscriptionsDiv) {
  subscriptionsDiv.innerHTML = ""; // Clear previous content

  Object.keys(groupedSubscriptions).forEach(company => {
    // Create a unique ID for the collapsible section
    const companyId = `group-${company.replace(/\s+/g, '-')}`;

    // Find the first available unsubscribe link for the group
    const firstUnsubscribeLink = groupedSubscriptions[company]
      .map(subscription => parseUnsubscribeLinks(subscription.unsubscribe).httpLink)
      .find(link => link !== null);

    // Add a dropdown button and collapsible content
    subscriptionsDiv.innerHTML += `
      <div class="company-group">
        <button class="dropdown-btn" onclick="toggleDropdown('${companyId}')">
          ${company} ▼
        </button>
        <div id="${companyId}" class="dropdown-content" style="display: none;">
          ${
            firstUnsubscribeLink
              ? `<button class="group-unsubscribe-btn" onclick="unsubscribe('${firstUnsubscribeLink}')">Unsubscribe</button>`
              : "<p>No unsubscribe link available for this group.</p>"
          }
        </div>
      </div>
    `;

    const companyDiv = document.getElementById(companyId);

    groupedSubscriptions[company].forEach(subscription => {
      companyDiv.innerHTML += `
        <div class="subscription">
          <p><strong>From:</strong> ${subscription.from}</p>
          <p><strong>Subject:</strong> ${subscription.subject}</p>
        </div>
      `;
    });
  });
}

// Toggle visibility of dropdown content
function toggleDropdown(groupId) {
  const content = document.getElementById(groupId);
  if (content.style.display === "none" || !content.style.display) {
    content.style.display = "block"; // Show dropdown content
  } else {
    content.style.display = "none"; // Hide dropdown content
  }
}



async function processMessagesInBatches(messages, batchSize, delayMs, groupedSubscriptions, subscriptionsDiv) {
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const promises = batch.map(message =>
      gapi.client.gmail.users.messages.get({ userId: 'me', id: message.id })
        .then(messageData => {
          const headers = messageData.result.payload.headers;
          const subject = headers.find(header => header.name === "Subject")?.value || "No Subject";
          const from = headers.find(header => header.name === "From")?.value || "Unknown Sender";
          const unsubscribe = headers.find(header => header.name.toLowerCase() === "list-unsubscribe")?.value || null;

          const company = extractCompanyName(from);
          if (!groupedSubscriptions[company]) {
            groupedSubscriptions[company] = [];
          }
          groupedSubscriptions[company].push({ from, subject, unsubscribe });
        })
        .catch(error => console.error("Error fetching message details:", error))
    );

    await Promise.all(promises); // Wait for the batch to finish
    renderGroupedSubscriptions(groupedSubscriptions, subscriptionsDiv); // Update UI incrementally
    await new Promise(resolve => setTimeout(resolve, delayMs)); // Delay between batches
  }
}


// Parse List-Unsubscribe Header
function parseUnsubscribeLinks(headerValue) {
  if (!headerValue) {
    console.warn("Unsubscribe header is missing or null.");
    return { httpLink: null };
  }

  const links = headerValue.split(',').map(link => link.trim().replace(/[<>]/g, ''));
  return {
    httpLink: links.find(link => link.startsWith('http')),
  };
}


// Unsubscribe Function
function unsubscribe(unsubscribeLink) {
  if (unsubscribeLink.startsWith("http")) {
    // Redirect the user to the unsubscribe page
    console.log("Redirecting to unsubscribe link:", unsubscribeLink);
    window.open(unsubscribeLink, "_blank"); // Open in a new tab
  } else {
    alert("Unsubscribe link is invalid.");
    console.error("Invalid unsubscribe link:", unsubscribeLink);
  }
}
