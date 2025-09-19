#!/bin/bash

echo "Testing Refactored Frontend Application..."
echo "=========================================="

# Check if frontend server is running
echo "1. Checking frontend server..."
curl -s http://localhost:3003/ > /dev/null
if [ $? -eq 0 ]; then
    echo "✓ Frontend server is running on port 3003"
else
    echo "✗ Frontend server is not responding"
    exit 1
fi

# Check if backend is accessible
echo "2. Checking backend health..."
curl -s http://localhost:8003/health | grep -q "healthy"
if [ $? -eq 0 ]; then
    echo "✓ Backend is healthy"
else
    echo "✗ Backend is not healthy or not running"
fi

# Test API endpoints through proxy
echo "3. Testing API endpoints..."

# Test filter options
echo "   - Testing /api/filter-options..."
curl -s http://localhost:3003/api/filter-options > /dev/null
if [ $? -eq 0 ]; then
    echo "✓ Filter options endpoint accessible"
else
    echo "✗ Filter options endpoint failed"
fi

echo ""
echo "Basic tests completed!"
echo ""
echo "Manual testing checklist:"
echo "1. Open http://localhost:3003 in browser"
echo "2. Check that the app loads without errors"
echo "3. Verify filters load properly"
echo "4. Test filter selection"
echo "5. Check if Sankey diagram renders"
echo "6. Click on nodes to see histogram popover"
echo "7. Adjust thresholds and verify updates"