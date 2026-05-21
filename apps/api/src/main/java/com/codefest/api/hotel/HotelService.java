package com.codefest.api.hotel;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HotelService {
  private final HotelRepository hotelRepository;
  private final HotelHoldRepository holdRepository;
  private final MockEmailService emailService;
  private final Duration holdDuration;
  private final String confirmationBaseUrl;
  private final Clock clock;

  public HotelService(
      HotelRepository hotelRepository,
      HotelHoldRepository holdRepository,
      MockEmailService emailService,
      @Value("${hotel.holds.default-duration}") Duration holdDuration,
      @Value("${hotel.holds.confirmation-base-url}") String confirmationBaseUrl) {
    this.hotelRepository = hotelRepository;
    this.holdRepository = holdRepository;
    this.emailService = emailService;
    this.holdDuration = holdDuration;
    this.confirmationBaseUrl = confirmationBaseUrl;
    this.clock = Clock.systemUTC();
  }

  public List<HotelResponse> listHotels(String city) {
    List<Hotel> hotels =
        city == null || city.isBlank()
            ? hotelRepository.findAllByOrderByNameAsc()
            : hotelRepository.findByCityContainingIgnoreCaseOrderByNameAsc(city);
    return hotels.stream().map(HotelResponse::from).toList();
  }

  public HotelResponse getHotel(Long hotelId) {
    return HotelResponse.from(
        hotelRepository.findById(hotelId).orElseThrow(() -> new HotelNotFoundException(hotelId)));
  }

  @Transactional
  public HoldResponse createHold(CreateHoldRequest request) {
    validateHoldContact(request);

    if (!request.checkOut().isAfter(request.checkIn())) {
      throw new HoldUnavailableException("checkOut must be after checkIn.");
    }

    Hotel hotel =
        hotelRepository
            .findById(request.hotelId())
            .orElseThrow(() -> new HotelNotFoundException(request.hotelId()));

    OffsetDateTime now = OffsetDateTime.now(clock);
    long reservedRooms =
        holdRepository.countReservedRooms(
            hotel.getId(),
            request.checkIn(),
            request.checkOut(),
            now,
            HoldStatus.HELD,
            HoldStatus.CONFIRMED);
    int remainingRooms = hotel.getAvailableRooms() - (int) reservedRooms;
    if (request.rooms() > remainingRooms) {
      throw new HoldUnavailableException(
          "Only " + Math.max(remainingRooms, 0) + " rooms remain for the selected dates.");
    }

    HotelHold hold =
        holdRepository.save(
            new HotelHold(
                hotel,
                blankToNull(request.guestEmail()),
                blankToNull(request.guestName()),
                blankToNull(request.loyaltyNumber()),
                request.checkIn(),
                request.checkOut(),
                request.rooms(),
                now.plus(holdDuration)));

    HoldResponse response = HoldResponse.from(hold, confirmationBaseUrl);
    emailService.sendHoldConfirmation(hold, response.confirmationUrl());
    return response;
  }

  private void validateHoldContact(CreateHoldRequest request) {
    boolean hasGuestContact = hasText(request.guestName()) && hasText(request.guestEmail());
    boolean hasLoyaltyNumber = hasText(request.loyaltyNumber());

    if (!hasGuestContact && !hasLoyaltyNumber) {
      throw new HoldUnavailableException(
          "Provide either guestName and guestEmail, or a loyaltyNumber.");
    }
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }

  private String blankToNull(String value) {
    return hasText(value) ? value : null;
  }

  @Transactional
  public HoldResponse getHold(UUID holdId) {
    HotelHold hold = holdRepository.findById(holdId).orElseThrow(() -> new HoldNotFoundException(holdId));
    expireIfNeeded(hold);
    return HoldResponse.from(hold, confirmationBaseUrl);
  }

  @Transactional
  public HoldResponse completeReservation(UUID holdId, CompleteReservationRequest request) {
    HotelHold hold = holdRepository.findById(holdId).orElseThrow(() -> new HoldNotFoundException(holdId));
    expireIfNeeded(hold);
    if (hold.getStatus() != HoldStatus.HELD) {
      throw new HoldUnavailableException("Hold cannot be completed because its status is " + hold.getStatus());
    }

    hold.confirm(request.phoneNumber(), request.billingReference());
    return HoldResponse.from(hold, confirmationBaseUrl);
  }

  private void expireIfNeeded(HotelHold hold) {
    if (hold.getStatus() == HoldStatus.HELD && !hold.getExpiresAt().isAfter(OffsetDateTime.now(clock))) {
      hold.expire();
    }
  }
}
