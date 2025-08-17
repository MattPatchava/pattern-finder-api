#!/bin/bash

API_URL="http://localhost:8080"
USERNAME="admin"
PASSWORD="password"
DURATION_SEC=300

PATTERN="facade"
PROTOCOL="sha256"
INPUT_LENGTH=8

# Get JWT
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | cut -d'"' -f4)

SUBMITTED=0
ACCEPTED=0
REJECTED=0

START=$(date +%s)
END=$((START + DURATION_SEC))

while [ "$(date +%s)" -lt "$END" ]; do
    # Get status code only
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$API_URL/v1/jobs" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"pattern\":\"$PATTERN\",\"protocol\":\"$PROTOCOL\",\"inputLength\":$INPUT_LENGTH}")
    
    SUBMITTED=$((SUBMITTED+1))

    if [ "$STATUS" -eq 202 ]; then
        ACCEPTED=$((ACCEPTED+1))
    elif [ "$STATUS" -eq 429 ]; then
        REJECTED=$((REJECTED+1))
        sleep 1
    fi
done

echo "Submitted: $SUBMITTED"
echo "Accepted: $ACCEPTED"
echo "Rejected: $REJECTED"
