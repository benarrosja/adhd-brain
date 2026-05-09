// naming/registry.js
// Service Registry using Bonjour mDNS
// This module allows each service to:
//   1. REGISTER itself on the local network when it starts
//   2. DISCOVER other services running on the network
//   3. SHUTDOWN cleanly when stopped
//
// Uses mDNS (multicast DNS) - the same technology that lets
//  phones find a printer without typing an IP address

const Bonjour = require('bonjour-service');

// One Bonjour instance manages all network announcements
const bonjour = new Bonjour();

// Keeps track of services have published
// so can stop them cleanly on shutdown
const publishedServices = {};

// ── REGISTER: announce a service on the local network ───────────────
// Called by each service when it starts up
// Example: registry.publishService('TaskService', 'adhd-task', 50051, {...})
function publishService(name, type, port, meta) {

  const service = bonjour.publish({
    name: name,   // human-readable name e.g. "TaskService"
    type: type,   // service type e.g. "adhd-task"
    port: port,   // the port this service runs on e.g. 50051
    txt:  meta    // extra info: protocol, version, description
  });

  // Save reference so can stop it later
  publishedServices[name] = service;

  console.log(`📡 Registered: ${name} on port ${port}`);
}

// ── DISCOVER: find services running on the local network ────────────
// Called by the GUI to find the 3 gRPC services
// Example: registry.discoverServices('adhd-task', callback)
function discoverServices(type, callback) {

  // Send an mDNS query and listen for replies
  const browser = bonjour.find({ type: type });

  // Fires each time a matching service is found
  browser.on('up', (service) => {
    console.log(`✅ Discovered: ${service.name} at port ${service.port}`);

    // Pass the service details back to whoever called this function
    callback({
      name: service.name,
      host: service.host,
      port: service.port,
      info: service.txt
    });
  });

  // Fires when a service goes offline
  browser.on('down', (service) => {
    console.log(`📴 Service went offline: ${service.name}`);
  });
}

// ─ SHUTDOWN: stop all services and release the network ─────────────
// Called when a service receives Ctrl+C (SIGINT signal)
function shutdown() {

  // Stop each service published - removes it from the network
  Object.values(publishedServices).forEach(svc => svc.stop());

  // Release the UDP socket used for mDNS
  bonjour.destroy();

  console.log('📴 Registry shut down cleanly');
}

// Export the three functions so other files can use them
module.exports = { publishService, discoverServices, shutdown };