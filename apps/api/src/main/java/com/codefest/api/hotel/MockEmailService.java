package com.codefest.api.hotel;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class MockEmailService {
  private static final Logger log = LoggerFactory.getLogger(MockEmailService.class);

  public void sendHoldConfirmation(HotelHold hold, String confirmationUrl) {
    if (hold.getGuestEmail() == null || hold.getGuestEmail().isBlank()) {
      log.info(
          "Created hotel hold {} for loyalty member {}. Confirmation URL available through loyalty account: {}",
          hold.getId(),
          hold.getLoyaltyNumber(),
          confirmationUrl);
      return;
    }

    log.info(
        "Sending hotel hold confirmation email to {} for hold {}. Confirmation URL: {}",
        hold.getGuestEmail(),
        hold.getId(),
        confirmationUrl);
  }
}
