"""runDefault.py - Main entry point for Telecharge lottery automation."""

import json
import os
import sys
from typing import Dict

from Telecharge import Telecharge


def get_user_info_from_env() -> Dict:
    """
    Get user information from environment variables.

    Returns:
        Dictionary containing user information
    """
    return {
        "firstName": os.environ.get("FIRST_NAME", ""),
        "lastName": os.environ.get("LAST_NAME", ""),
        "numberOfTickets": os.environ.get("NUMBER_OF_TICKETS", "1"),
        "email": os.environ.get("EMAIL", ""),
        "dateOfBirth": {
            "month": os.environ.get("DOB_MONTH", "1"),
            "day": os.environ.get("DOB_DAY", "1"),
            "year": os.environ.get("DOB_YEAR", "1990"),
        },
        "zip": os.environ.get("ZIP", ""),
        "country": os.environ.get("COUNTRY", "USA"),
    }


def load_config(config_path: str = "config.json") -> Dict:
    """
    Load configuration from JSON file.

    Args:
        config_path: Path to configuration file

    Returns:
        Configuration dictionary
    """
    try:
        with open(config_path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"⚠️  Config file not found: {config_path}")
        print("Using environment variables for configuration")
        return {}
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing config JSON: {str(e)}")
        sys.exit(1)


def main():
    """Main function to run Telecharge lottery automation."""
    print("🎭 Starting Telecharge Lottery Automation...")

    # Load configuration
    config = load_config()
    if not config:
        # Use environment variables
        config = {
            "SELENIUM_URL": os.environ.get(
                "SELENIUM_URL", "http://localhost:4444/wd/hub"
            ),
            "SHOWS_TO_ENTER_PATH": os.environ.get(
                "SHOWS_TO_ENTER_PATH", "showsToEnter.json"
            ),
        }

    # Get user info from environment variables
    user_info = get_user_info_from_env()

    # Validate required fields
    required_fields = ["firstName", "lastName", "email", "zip"]
    missing_fields = [field for field in required_fields if not user_info.get(field)]
    if missing_fields:
        print(f"❌ Missing required environment variables: {', '.join(missing_fields)}")
        sys.exit(1)

    # Initialize Telecharge
    telecharge = Telecharge(config)

    # Setup WebDriver
    if not telecharge.setup_driver():
        print("❌ Failed to setup WebDriver")
        sys.exit(1)

    try:
        # Load shows
        shows_path = config.get("SHOWS_TO_ENTER_PATH", "showsToEnter.json")
        if not telecharge.load_shows(shows_path):
            print("❌ Failed to load shows")
            sys.exit(1)

        # Enter lotteries
        results = telecharge.enter_lotteries(user_info)

        # Print summary
        print("\n📊 Summary:")
        successful = sum(1 for success in results.values() if success)
        total = len(results)
        print(f"✅ Successfully entered: {successful}/{total}")

        for show_name, success in results.items():
            status = "✅" if success else "❌"
            print(f"  {status} {show_name}")

    finally:
        # Cleanup
        telecharge.cleanup()

    print("🎭 Telecharge Lottery Automation completed")


if __name__ == "__main__":
    main()

