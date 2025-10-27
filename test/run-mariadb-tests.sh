#!/bin/bash

# MariaDB Integration Test Runner
# This script starts the MariaDB container and runs integration tests

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== MyDBA MariaDB Integration Test Runner ===${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/.."

echo -e "${YELLOW}Step 1: Stopping existing MariaDB container (if any)...${NC}"
docker-compose -f docker-compose.test.yml rm -f mariadb-10.11 || true

echo -e "${YELLOW}Step 2: Starting fresh MariaDB container...${NC}"
docker-compose -f docker-compose.test.yml up -d mariadb-10.11

echo -e "${YELLOW}Step 3: Waiting for MariaDB to initialize (30 seconds)...${NC}"
sleep 5

# Wait for MariaDB to be healthy
echo -e "${YELLOW}Checking MariaDB health...${NC}"
for i in {1..25}; do
    if docker exec mydba-mariadb-10.11 mysqladmin ping -h localhost -uroot -ptest_password > /dev/null 2>&1; then
        echo -e "${GREEN}✓ MariaDB is ready!${NC}"
        break
    fi
    if [ $i -eq 25 ]; then
        echo -e "${RED}Error: MariaDB failed to start within timeout${NC}"
        echo "Showing container logs:"
        docker logs mydba-mariadb-10.11 --tail 50
        exit 1
    fi
    echo -n "."
    sleep 2
done
echo ""

# Wait a bit more for initialization scripts to complete
echo -e "${YELLOW}Waiting for initialization scripts to complete...${NC}"
sleep 5

echo -e "${YELLOW}Step 4: Verifying database setup...${NC}"
docker exec mydba-mariadb-10.11 mysql -utest_user -ptest_password test_db -e "SELECT COUNT(*) as user_count FROM users;" 2>/dev/null || {
    echo -e "${RED}Error: Test data not initialized properly${NC}"
    echo "Container logs:"
    docker logs mydba-mariadb-10.11 --tail 50
    exit 1
}
echo -e "${GREEN}✓ Test data initialized${NC}"

echo -e "${YELLOW}Step 5: Verifying Performance Schema...${NC}"
docker exec mydba-mariadb-10.11 mysql -utest_user -ptest_password test_db -e "SELECT @@performance_schema;" 2>/dev/null || {
    echo -e "${RED}Error: Performance Schema not accessible${NC}"
    exit 1
}
echo -e "${GREEN}✓ Performance Schema is enabled${NC}"

echo -e "${YELLOW}Step 6: Verifying permissions...${NC}"
docker exec mydba-mariadb-10.11 mysql -utest_user -ptest_password test_db -e "SELECT COUNT(*) FROM performance_schema.events_statements_summary_by_digest;" 2>/dev/null || {
    echo -e "${RED}Error: test_user cannot access performance_schema${NC}"
    exit 1
}
echo -e "${GREEN}✓ Permissions are correct${NC}"

echo ""
echo -e "${GREEN}=== MariaDB Setup Complete ===${NC}"
echo ""
echo -e "${YELLOW}MariaDB Connection Details:${NC}"
echo "  Host: localhost"
echo "  Port: 3307"
echo "  User: test_user"
echo "  Password: test_password"
echo "  Database: test_db"
echo ""

# Run tests if requested
if [ "$1" == "--run-tests" ] || [ "$1" == "-t" ]; then
    echo -e "${YELLOW}Step 7: Compiling TypeScript...${NC}"
    npm run compile

    echo -e "${YELLOW}Step 8: Running MariaDB integration tests...${NC}"
    echo ""
    npm test

    echo ""
    echo -e "${GREEN}=== Tests Complete ===${NC}"
else
    echo -e "${YELLOW}MariaDB container is ready for testing!${NC}"
    echo ""
    echo "To run the tests, use:"
    echo "  npm test"
    echo ""
    echo "Or run this script with --run-tests flag:"
    echo "  ./test/run-mariadb-tests.sh --run-tests"
    echo ""
    echo "To stop the container:"
    echo "  docker-compose -f docker-compose.test.yml stop mariadb-10.11"
fi
