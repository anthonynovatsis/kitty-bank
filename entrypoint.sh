#!/bin/sh
set -e

echo "🐱 Starting Kitty Bank..."

# Check if database file exists
DB_FILE="/app/data/db.sqlite"

if [ ! -f "$DB_FILE" ]; then
  echo "📦 Database not found. Creating and initializing..."
  # Create the data directory if it doesn't exist
  mkdir -p /app/data
  
  # Run database push to create tables
  echo "🔨 Creating database tables..."
  pnpm db:push
  
  echo "✅ Database initialized successfully!"
else
  echo "✅ Database found at $DB_FILE"
  
  # Optionally run migrations if schema has changed
  echo "🔄 Checking for schema updates..."
  pnpm db:push
fi

echo "🚀 Starting application..."
exec pnpm start