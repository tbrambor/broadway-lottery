"""TelechargeShow.py - Represents a single Telecharge show."""

import json
import time
from typing import Optional

from selenium.webdriver.common.by import By


class TelechargeShow:
    """Represents a single Telecharge show with lottery entry functionality."""

    def __init__(self, driver, show_data: dict):
        """
        Initialize a TelechargeShow instance.

        Args:
            driver: Selenium WebDriver instance
            show_data: Dictionary containing show information (name, url, num_tickets)
        """
        self.driver = driver
        self.name = show_data.get("name", "")
        self.url = show_data.get("url", "")
        self.num_tickets = show_data.get("num_tickets", 1)
        self.lottery_url: Optional[str] = None
        self.is_open: bool = False

    def refresh_info(self) -> bool:
        """
        Refresh show information by visiting the show page and checking lottery status.

        Returns:
            True if lottery is open, False otherwise
        """
        if not self.url:
            print(f"⚠️  No URL provided for {self.name}")
            return False

        try:
            print(f"🔍 Checking lottery status for {self.name}...")
            self.driver.get(self.url)
            time.sleep(2)  # Wait for page to load

            # Look for lottery entry link/button
            # Common selectors for Telecharge lottery links
            lottery_selectors = [
                "a[href*='lottery']",
                "a[href*='enter']",
                ".lottery-link",
                "a:contains('Enter Lottery')",
                "a:contains('Lottery')",
            ]

            self.lottery_url = None
            for selector in lottery_selectors:
                try:
                    elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    for element in elements:
                        href = element.get_attribute("href")
                        text = element.text.lower()
                        if href and ("lottery" in href.lower() or "enter" in href.lower()):
                            if "lottery" in text or "enter" in text:
                                self.lottery_url = href
                                break
                    if self.lottery_url:
                        break
                except Exception:
                    continue

            # Check if lottery is open by looking for "Enter" or "Open" text
            page_text = self.driver.page_source.lower()
            self.is_open = (
                "enter lottery" in page_text
                or "lottery open" in page_text
                or "enter now" in page_text
            ) and "closed" not in page_text

            if self.is_open and self.lottery_url:
                print(f"✅ Lottery is OPEN for {self.name}")
                return True
            else:
                print(f"ℹ️  Lottery is CLOSED or not available for {self.name}")
                return False

        except Exception as e:
            print(f"❌ Error refreshing info for {self.name}: {str(e)}")
            return False

    def enter_lottery(self, user_info: dict) -> bool:
        """
        Enter the lottery for this show.

        Args:
            user_info: Dictionary containing user information (firstName, lastName, etc.)

        Returns:
            True if entry was successful, False otherwise
        """
        if not self.is_open or not self.lottery_url:
            print(f"⚠️  Cannot enter lottery for {self.name} - not open or no URL")
            return False

        try:
            print(f"🎫 Entering lottery for {self.name}...")
            self.driver.get(self.lottery_url)
            time.sleep(3)  # Wait for form to load

            # Fill in the lottery entry form
            # Common form field selectors for Telecharge
            form_fields = {
                "firstName": [
                    'input[name="firstName"]',
                    'input[name="first_name"]',
                    'input[id*="firstName"]',
                    'input[id*="first_name"]',
                ],
                "lastName": [
                    'input[name="lastName"]',
                    'input[name="last_name"]',
                    'input[id*="lastName"]',
                    'input[id*="last_name"]',
                ],
                "email": [
                    'input[name="email"]',
                    'input[type="email"]',
                    'input[id*="email"]',
                ],
                "numTickets": [
                    'select[name="numTickets"]',
                    'select[name="tickets"]',
                    'select[id*="tickets"]',
                ],
                "dobMonth": [
                    'select[name="dobMonth"]',
                    'select[name="month"]',
                    'select[id*="month"]',
                ],
                "dobDay": [
                    'select[name="dobDay"]',
                    'select[name="day"]',
                    'select[id*="day"]',
                ],
                "dobYear": [
                    'select[name="dobYear"]',
                    'select[name="year"]',
                    'select[id*="year"]',
                ],
                "zip": [
                    'input[name="zip"]',
                    'input[name="zipCode"]',
                    'input[id*="zip"]',
                ],
            }

            # Fill in text fields
            for field_name, selectors in form_fields.items():
                if field_name in ["numTickets", "dobMonth", "dobDay", "dobYear"]:
                    continue  # Handle these separately

                value = None
                if field_name == "firstName":
                    value = user_info.get("firstName", "")
                elif field_name == "lastName":
                    value = user_info.get("lastName", "")
                elif field_name == "email":
                    value = user_info.get("email", "")
                elif field_name == "zip":
                    value = user_info.get("zip", "")

                if not value:
                    continue

                filled = False
                for selector in selectors:
                    try:
                        element = self.driver.find_element(By.CSS_SELECTOR, selector)
                        element.clear()
                        element.send_keys(value)
                        filled = True
                        break
                    except Exception:
                        continue

                if not filled:
                    print(f"⚠️  Could not find {field_name} field for {self.name}")

            # Fill in select fields
            from selenium.webdriver.support.ui import Select

            num_tickets = user_info.get("numberOfTickets", "1")
            for selector in form_fields["numTickets"]:
                try:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    select = Select(element)
                    select.select_by_value(num_tickets)
                    break
                except Exception:
                    continue

            # Fill in date of birth
            dob = user_info.get("dateOfBirth", {})
            month = dob.get("month", "1")
            day = dob.get("day", "1")
            year = dob.get("year", "1990")

            for selector in form_fields["dobMonth"]:
                try:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    select = Select(element)
                    select.select_by_value(month)
                    break
                except Exception:
                    continue

            for selector in form_fields["dobDay"]:
                try:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    select = Select(element)
                    select.select_by_value(day)
                    break
                except Exception:
                    continue

            for selector in form_fields["dobYear"]:
                try:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    select = Select(element)
                    select.select_by_value(year)
                    break
                except Exception:
                    continue

            # Submit the form
            submit_selectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:contains("Submit")',
                'button:contains("Enter")',
                '.submit-button',
            ]

            submitted = False
            for selector in submit_selectors:
                try:
                    element = self.driver.find_element(By.CSS_SELECTOR, selector)
                    element.click()
                    submitted = True
                    time.sleep(2)  # Wait for submission
                    break
                except Exception:
                    continue

            if submitted:
                print(f"✅ Successfully entered lottery for {self.name}")
                return True
            else:
                print(f"⚠️  Could not find submit button for {self.name}")
                return False

        except Exception as e:
            print(f"❌ Error entering lottery for {self.name}: {str(e)}")
            return False

