export type Country = "USA" | "CANADA" | "OTHER";

export type UserInfo = {
  firstName: string;
  lastName: string;
  numberOfTickets: string;
  email: string;
  dateOfBirth: {
    month: string;
    day: string;
    year: string;
  };
  zip: string;
  countryOfResidence: Country;
};

export type TelechargeLogin = {
  email: string;
  password: string;
};

export type LotteryResult = {
  success: boolean;
  message: string;
  reason: "submitted" | "closed" | "failed" | "error";
};
