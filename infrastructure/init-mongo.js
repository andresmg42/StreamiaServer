// MongoDB initialization script
// Creates databases and users for each microservice

// Switch to admin database
db = db.getSiblingDB('admin');

// Create databases for each service
const databases = [
  'streamia_users',
  'streamia_movies', 
  'streamia_favorites',
  'streamia_ratings',
  'streamia_comments'
];

databases.forEach(dbName => {
  print(`Creating database: ${dbName}`);
  db = db.getSiblingDB(dbName);
  
  // Create a collection to ensure the database exists
  db.createCollection('_init');
  db._init.drop();
  
  print(`Database ${dbName} created successfully`);
});

print('All databases initialized successfully');
