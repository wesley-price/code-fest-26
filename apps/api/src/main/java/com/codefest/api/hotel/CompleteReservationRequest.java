package com.codefest.api.hotel;

import jakarta.validation.constraints.NotBlank;

public record CompleteReservationRequest(
    String phoneNumber, @NotBlank String billingReference) {}
