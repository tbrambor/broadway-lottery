"""Telecharge.py - Main class for Telecharge lottery automation."""

import json
import os
import time
from typing import Dict, List, Optional

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.remote.webdriver import WebDriver

from TelechargeShow import TelechargeShow


class Telecharge:
    """Main class for automating Telecharge lottery entries."""

    def __init__(self, config: Dict):
        """
        Initialize Telecharge instance.

        Args:
            config: Configuration dictionary containing selenium_url and other settings
        """
        self.config = config
        self.selenium_url = config.get("SELENIUM_URL", "http://localhost:4444/wd/hub")
        self.driver: Optional[WebDriver] = None
        self.shows: List[TelechargeShow] = []

    def setup_driver(self) -> bool:
        """
        Set up the Selenium WebDriver.

        Returns:
            True if setup successful, False otherwise
        """
        try:
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--window-size=1920,1080")
            chrome_options.add_argument(
                "user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            )

            self.driver = webdriver.Remote(
                command_executor=self.selenium_url, options=chrome_options
            )
            print("✅ Selenium WebDriver initialized successfully")
            return True
        except Exception as e:
            print(f"❌ Error setting up WebDriver: {str(e)}")
            return False

    def load_shows(self, shows_path: str) -> bool:
        """
        Load shows from JSON file.

        Args:
            shows_path: Path to JSON file containing show information

        Returns:
            True if loaded successfully, False otherwise
        """
        try:
            with open(shows_path, "r") as f:
                shows_data = json.load(f)

            if not isinstance(shows_data, list):
                print("❌ Shows file must contain a JSON array")
                return False

            self.shows = [
                TelechargeShow(self.driver, show_data) for show_data in shows_data
            ]
            print(f"✅ Loaded {len(self.shows)} show(s) from {shows_path}")
            return True
        except FileNotFoundError:
            print(f"❌ Shows file not found: {shows_path}")
            return False
        except json.JSONDecodeError as e:
            print(f"❌ Error parsing shows JSON: {str(e)}")
            return False
        except Exception as e:
            print(f"❌ Error loading shows: {str(e)}")
            return False

    def enter_lotteries(self, user_info: Dict) -> Dict[str, bool]:
        """
        Enter lotteries for all loaded shows.

        Args:
            user_info: Dictionary containing user information

        Returns:
            Dictionary mapping show names to success status
        """
        if not self.driver:
            print("❌ WebDriver not initialized. Call setup_driver() first.")
            return {}

        results = {}
        for show in self.shows:
            try:
                # Refresh show info to check if lottery is open
                if show.refresh_info():
                    # Enter the lottery
                    success = show.enter_lottery(user_info)
                    results[show.name] = success
                else:
                    results[show.name] = False
                    print(f"ℹ️  Skipping {show.name} - lottery not open")
            except Exception as e:
                print(f"❌ Error processing {show.name}: {str(e)}")
                results[show.name] = False

            # Small delay between shows
            time.sleep(2)

        return results

    def cleanup(self):
        """Clean up resources (close WebDriver)."""
        if self.driver:
            try:
                self.driver.quit()
                print("✅ WebDriver closed successfully")
            except Exception:
                pass

