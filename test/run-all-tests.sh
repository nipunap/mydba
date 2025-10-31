#!/bin/bash

# Run tests against both MySQL and MariaDB
# This script starts both database containers and runs the full test suite

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   MyDBA - Full Database Test Suite       ║${NC}"
echo -e "${BLUE}║   MySQL 8.0 + MariaDB 10.11              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Error: Docker is not running${NC}"
    echo "  Please start Docker and try again"
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/.."

# Stop existing containers
echo -e "${YELLOW}→ Stopping existing containers...${NC}"
docker-compose -f docker-compose.test.yml down > /dev/null 2>&1 || true

# Start both databases
echo -e "${YELLOW}→ Starting MySQL 8.0 and MariaDB 10.11...${NC}"
docker-compose -f docker-compose.test.yml up -d

# Wait for databases to initialize
echo -e "${YELLOW}→ Waiting for databases to initialize...${NC}"
sleep 5

# Check MySQL health
echo -n "  Checking MySQL 8.0... "
for i in {1..30}; do
    if docker exec mydba-mysql-8.0 mysqladmin ping -h localhost -uroot -ptest_password > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ Timeout${NC}"
        docker logs mydba-mysql-8.0 --tail 20
        exit 1
    fi
    sleep 1
done

# Check MariaDB health
echo -n "  Checking MariaDB 10.11... "
for i in {1..30}; do
    if docker exec mydba-mariadb-10.11 mysqladmin ping -h localhost -uroot -ptest_password > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ Timeout${NC}"
        docker logs mydba-mariadb-10.11 --tail 20
        exit 1
    fi
    sleep 1
done

# Verify Performance Schema on MySQL
echo -n "  Verifying MySQL Performance Schema... "
PS_CHECK=$(docker exec mydba-mysql-8.0 mysql -u test_user -ptest_password -N -e "SHOW VARIABLES LIKE 'performance_schema';" | awk '{print $2}')
if [ "$PS_CHECK" = "ON" ]; then
    echo -e "${GREEN}✓ Enabled${NC}"
else
    echo -e "${RED}✗ Disabled${NC}"
    exit 1
fi

# Verify Performance Schema on MariaDB
echo -n "  Verifying MariaDB Performance Schema... "
PS_CHECK=$(docker exec mydba-mariadb-10.11 mysql -u test_user -ptest_password -N -e "SHOW VARIABLES LIKE 'performance_schema';" | awk '{print $2}')
if [ "$PS_CHECK" = "ON" ]; then
    echo -e "${GREEN}✓ Enabled${NC}"
else
    echo -e "${RED}✗ Disabled${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ Both databases are ready!${NC}"
echo ""

# Show connection details
echo -e "${BLUE}═══ Connection Details ═══${NC}"
echo -e "${YELLOW}MySQL 8.0:${NC}"
echo "  Host: localhost"
echo "  Port: 3306"
echo "  User: test_user"
echo "  Pass: test_password"
echo "  DB:   test_db"
echo ""
echo -e "${YELLOW}MariaDB 10.11:${NC}"
echo "  Host: localhost"
echo "  Port: 3307"
echo "  User: test_user"
echo "  Pass: test_password"
echo "  DB:   test_db"
echo ""

# Run tests if requested
if [ "$1" = "--run-tests" ] || [ "$1" = "-t" ]; then
    echo -e "${BLUE}═══ Running Test Suite ═══${NC}"
    echo ""
    npm test

    TEST_RESULT=$?
    echo ""
    if [ $TEST_RESULT -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
    else
        echo -e "${RED}✗ Some tests failed${NC}"
        exit $TEST_RESULT
    fi
else
    echo -e "${BLUE}═══ Databases Ready ═══${NC}"
    echo ""
    echo "To run tests manually:"
    echo -e "  ${YELLOW}npm test${NC}"
    echo ""
    echo "Or run with auto-test:"
    echo -e "  ${YELLOW}$0 --run-tests${NC}"
    echo ""
    echo "To stop databases:"
    echo -e "  ${YELLOW}docker-compose -f docker-compose.test.yml down${NC}"
fi

echo ""
