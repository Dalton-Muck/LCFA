#!/usr/bin/env python3
"""
Print Course Offerings from API

Fetches and displays the first 50 course offerings from the Ohio University API.
"""

import os
import sys
import requests
from dotenv import load_dotenv
from datetime import datetime


def fetch_first_page():
    """Fetch first page of course offerings."""
    load_dotenv()
    
    api_url = os.getenv("COURSE_CATALOG_URL")
    if not api_url:
        print("Error: COURSE_CATALOG_URL not set in .env file")
        sys.exit(1)
    
    print(f"🔗 Fetching from: {api_url}")
    print("⏳ Please wait...\n")
    
    try:
        # Request body based on the guide
        payload = {
            "terms": ["2251::FALL", "2257::SUMMER1", "2257::SUMMER2", "2257::SUMMERFULL", "2255::SPRING"],
            "campuses": ["ATHN"],
            "program": "",
            "subjects": [],
            "catalogNumber": "",
            "name": "",
            "topic": "",
            "level": "UGRD",
            "status": ["OPEN", "WAITLIST", "MAJORS", "PERMISSION", "FULL"],
            "generalEducationTier1": [],
            "generalEducationTier2": [],
            "generalEducationTier3": [],
            "themes": [],
            "bricks": [],
            "isSync": True,
            "isAsync": True,
            "instructors": [],
            "description": "",
            "offeredInPerson": True,
            "offeredOnline": True,
            "startTime": "",
            "endTime": "",
            "days": [],
            "eligibleGrades": "",
            "building": []
        }
        
        # Query parameters
        params = {
            "selectedTab": "ATHN",
            "page": 1,
            "pageSize": 50  # Fetch 50 results
        }
        
        response = requests.post(
            api_url,
            params=params,
            json=payload,
            timeout=30
        )
        
        response.raise_for_status()
        data = response.json()
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching data: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response status: {e.response.status_code}")
            print(f"Response body: {e.response.text[:500]}")
        sys.exit(1)


def print_courses(courses, limit=50):
    """Print course offerings."""
    print("=" * 100)
    print("COURSE OFFERINGS - FIRST 50 RESULTS")
    print("=" * 100)
    print()
    
    for i, course in enumerate(courses[:limit], 1):
        print(f"#{i}")
        print(f"  Code:       {course.get('subject', 'N/A')} {course.get('catalogNumber', 'N/A')}")
        print(f"  Title:      {course.get('title', 'N/A')}")
        print(f"  Credits:    {course.get('minCreditHours', 'N/A')} hours")
        
        if course.get('college'):
            print(f"  College:    {course.get('college')}")
        
        if course.get('department'):
            print(f"  Department: {course.get('department')}")
        
        if course.get('requisite'):
            req = course.get('requisite', '')
            if len(req) > 80:
                req = req[:77] + "..."
            print(f"  Prerequisites: {req}")
        
        if course.get('description'):
            desc = course.get('description', '')
            if len(desc) > 150:
                desc = desc[:147] + "..."
            print(f"  Description: {desc}")
        
        print("-" * 100)
    
    print()
    print(f"✅ Displayed {min(len(courses), limit)} courses")
    print()


def main():
    """Main function."""
    print("\n🎓 OHIO UNIVERSITY COURSE OFFERINGS")
    print()
    
    # Fetch data
    data = fetch_first_page()
    
    # Extract courses and counts
    courses = data.get('results', [])
    counts = data.get('counts', {})
    
    # Print summary
    print("=" * 100)
    print("SEARCH RESULTS SUMMARY")
    print("=" * 100)
    print(f"Results returned: {len(courses)}")
    if counts:
        print(f"Total available: {counts.get('total', 'N/A')}")
        print(f"Open: {counts.get('open', 'N/A')}")
        print(f"Full: {counts.get('full', 'N/A')}")
    print("=" * 100)
    print()
    
    if not courses:
        print("⚠️  No courses found")
        print("\nPossible reasons:")
        print("  1. API endpoint changed")
        print("  2. No courses match the search criteria")
        print("  3. API requires authentication")
        return
    
    # Print courses
    print_courses(courses, limit=50)


if __name__ == "__main__":
    main()

