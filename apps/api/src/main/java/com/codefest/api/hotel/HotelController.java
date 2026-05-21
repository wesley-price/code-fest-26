package com.codefest.api.hotel;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HotelController {
  private final HotelService hotelService;

  public HotelController(HotelService hotelService) {
    this.hotelService = hotelService;
  }

  @GetMapping("/hotels")
  public List<HotelResponse> listHotels(@RequestParam(required = false) String city) {
    return hotelService.listHotels(city);
  }

  @GetMapping("/hotels/{hotelId}")
  public HotelResponse getHotel(@PathVariable Long hotelId) {
    return hotelService.getHotel(hotelId);
  }

  @PostMapping("/hotel-holds")
  public HoldResponse createHold(@Valid @RequestBody CreateHoldRequest request) {
    return hotelService.createHold(request);
  }

  @GetMapping("/hotel-holds/{holdId}")
  public HoldResponse getHold(@PathVariable UUID holdId) {
    return hotelService.getHold(holdId);
  }

  @PostMapping("/hotel-holds/{holdId}/complete")
  public HoldResponse completeReservation(
      @PathVariable UUID holdId, @Valid @RequestBody CompleteReservationRequest request) {
    return hotelService.completeReservation(holdId, request);
  }
}
