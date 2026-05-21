package com.codefest.api.hotel;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record CreateHoldRequest(
    @NotNull Long hotelId,
    String guestName,
    @Email String guestEmail,
    String loyaltyNumber,
    @NotNull @FutureOrPresent LocalDate checkIn,
    @NotNull LocalDate checkOut,
    @Min(1) int rooms) {}
