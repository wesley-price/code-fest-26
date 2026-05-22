package com.codefest.api.hotel;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record HoldResponse(
    UUID id,
    HotelResponse hotel,
    String guestEmail,
    String guestName,
    String loyaltyNumber,
    LocalDate checkIn,
    LocalDate checkOut,
    int rooms,
    HoldStatus status,
    OffsetDateTime expiresAt,
    OffsetDateTime confirmedAt,
    String phoneNumber,
    String confirmationUrl) {
  static HoldResponse from(HotelHold hold, String confirmationBaseUrl) {
    String confirmationUrl = confirmationBaseUrl + "?reservation=" + hold.getId();
    return new HoldResponse(
        hold.getId(),
        HotelResponse.from(hold.getHotel()),
        hold.getGuestEmail(),
        hold.getGuestName(),
        hold.getLoyaltyNumber(),
        hold.getCheckIn(),
        hold.getCheckOut(),
        hold.getRooms(),
        hold.getStatus(),
        hold.getExpiresAt(),
        hold.getConfirmedAt(),
        hold.getPhoneNumber(),
        confirmationUrl);
  }
}
