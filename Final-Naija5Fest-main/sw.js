// Service Worker for Naija5Fest PWA
const CACHE_NAME = 'naija5fest-v1.0.0';
const STATIC_CACHE = 'naija5fest-static-v1';
const DYNAMIC_CACHE = 'naija5fest-dynamic-v1';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/index.html',
  '/registration.html',
  '/tournament.html',
  '/fanzone.html',
  '/sponsors.html',
  '/media.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://public-frontend-cos.metadl.com/mgx/img/favicon.png'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Service Worker: Static files cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Error caching static files:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated successfully');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          console.log('Service Worker: Serving from cache:', request.url);
          return cachedResponse;
        }

        // Otherwise, fetch from network and cache dynamically
        return fetch(request)
          .then((networkResponse) => {
            // Check if response is valid
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone response for caching
            const responseClone = networkResponse.clone();

            // Cache dynamic content (but not external APIs or large files)
            if (shouldCacheDynamically(request.url)) {
              caches.open(DYNAMIC_CACHE)
                .then((cache) => {
                  console.log('Service Worker: Caching dynamic content:', request.url);
                  cache.put(request, responseClone);
                })
                .catch((error) => {
                  console.error('Service Worker: Error caching dynamic content:', error);
                });
            }

            return networkResponse;
          })
          .catch((error) => {
            console.error('Service Worker: Network fetch failed:', error);
            
            // Return offline fallback for HTML pages
            if (request.headers.get('accept').includes('text/html')) {
              return caches.match('/index.html');
            }
            
            // Return offline fallback for images
            if (request.headers.get('accept').includes('image')) {
              return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#f0f0f0"/><text x="100" y="100" text-anchor="middle" dy="0.3em" font-family="Arial" font-size="14" fill="#666">Image Offline</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            }
            
            throw error;
          });
      })
  );
});

// Helper function to determine if content should be cached dynamically
function shouldCacheDynamically(url) {
  // Don't cache external APIs or analytics
  const excludePatterns = [
    'analytics',
    'gtag',
    'facebook.com',
    'twitter.com',
    'instagram.com',
    'youtube.com/embed'
  ];
  
  return !excludePatterns.some(pattern => url.includes(pattern));
}

// Background sync for form submissions (when online)
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered:', event.tag);
  
  if (event.tag === 'team-registration') {
    event.waitUntil(syncTeamRegistrations());
  } else if (event.tag === 'fan-registration') {
    event.waitUntil(syncFanRegistrations());
  } else if (event.tag === 'sponsor-inquiry') {
    event.waitUntil(syncSponsorInquiries());
  }
});

// Sync team registrations when back online
async function syncTeamRegistrations() {
  try {
    const pendingRegistrations = await getPendingData('pending_team_registrations');
    
    for (const registration of pendingRegistrations) {
      try {
        // In a real app, this would sync with your backend
        console.log('Syncing team registration:', registration);
        
        // Move from pending to completed
        await movePendingToCompleted('pending_team_registrations', 'registered_teams', registration);
        
        // Show notification to user
        self.registration.showNotification('Team Registration Synced', {
          body: `Team ${registration.teamName} registration has been synchronized.`,
          icon: '/favicon.png',
          badge: '/favicon.png',
          tag: 'sync-notification'
        });
        
      } catch (error) {
        console.error('Error syncing team registration:', error);
      }
    }
  } catch (error) {
    console.error('Error in syncTeamRegistrations:', error);
  }
}

// Sync fan registrations when back online
async function syncFanRegistrations() {
  try {
    const pendingRegistrations = await getPendingData('pending_fan_registrations');
    
    for (const registration of pendingRegistrations) {
      try {
        console.log('Syncing fan registration:', registration);
        await movePendingToCompleted('pending_fan_registrations', 'registered_fans', registration);
        
        self.registration.showNotification('Fan Registration Synced', {
          body: `Fan registration for ${registration.firstName} has been synchronized.`,
          icon: '/favicon.png',
          badge: '/favicon.png',
          tag: 'sync-notification'
        });
        
      } catch (error) {
        console.error('Error syncing fan registration:', error);
      }
    }
  } catch (error) {
    console.error('Error in syncFanRegistrations:', error);
  }
}

// Sync sponsor inquiries when back online
async function syncSponsorInquiries() {
  try {
    const pendingInquiries = await getPendingData('pending_sponsor_inquiries');
    
    for (const inquiry of pendingInquiries) {
      try {
        console.log('Syncing sponsor inquiry:', inquiry);
        await movePendingToCompleted('pending_sponsor_inquiries', 'sponsor_inquiries', inquiry);
        
        self.registration.showNotification('Sponsor Inquiry Synced', {
          body: `Sponsor inquiry from ${inquiry.companyName} has been synchronized.`,
          icon: '/favicon.png',
          badge: '/favicon.png',
          tag: 'sync-notification'
        });
        
      } catch (error) {
        console.error('Error syncing sponsor inquiry:', error);
      }
    }
  } catch (error) {
    console.error('Error in syncSponsorInquiries:', error);
  }
}

// Helper functions for IndexedDB operations
async function getPendingData(storeName) {
  // In a real app, you'd use IndexedDB here
  // For now, we'll simulate with an empty array
  return [];
}

async function movePendingToCompleted(pendingStore, completedStore, data) {
  // In a real app, you'd move data between IndexedDB stores
  console.log(`Moving data from ${pendingStore} to ${completedStore}:`, data);
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'New update from Naija5Fest!',
    icon: '/favicon.png',
    badge: '/favicon.png',
    vibrate: [200, 100, 200],
    tag: 'naija5fest-notification',
    actions: [
      {
        action: 'view',
        title: 'View Details',
        icon: '/favicon.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/favicon.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Naija5Fest Update', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification
    return;
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handling from main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  console.log('Service Worker: Periodic sync triggered:', event.tag);
  
  if (event.tag === 'update-tournament-data') {
    event.waitUntil(updateTournamentData());
  }
});

async function updateTournamentData() {
  try {
    // In a real app, fetch latest tournament data
    console.log('Updating tournament data in background');
    
    // Cache updated data
    const cache = await caches.open(DYNAMIC_CACHE);
    // Update cache with fresh data
    
  } catch (error) {
    console.error('Error updating tournament data:', error);
  }
}

console.log('Service Worker: Script loaded successfully');