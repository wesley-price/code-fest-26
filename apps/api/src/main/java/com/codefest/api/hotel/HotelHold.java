package com.codefest.api.hotel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "hotel_holds")
public class HotelHold {
  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "hotel_id", nullable = false)
  private Hotel hotel;

  private String guestEmail;

  private String guestName;

  private String loyaltyNumber;

  @Column(nullable = false)
  private LocalDate checkIn;

  @Column(nullable = false)
  private LocalDate checkOut;

  @Column(nullable = false)
  private int rooms;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 32)
  private HoldStatus status = HoldStatus.HELD;

  @CreationTimestamp
  @Column(nullable = false, updatable = false)
  private OffsetDateTime createdAt;

  @Column(nullable = false)
  private OffsetDateTime expiresAt;

  private OffsetDateTime confirmedAt;

  private String phoneNumber;

  private String billingReference;

  protected HotelHold() {}

  public HotelHold(
      Hotel hotel,
      String guestEmail,
      String guestName,
      String loyaltyNumber,
      LocalDate checkIn,
      LocalDate checkOut,
      int rooms,
      OffsetDateTime expiresAt) {
    this.hotel = hotel;
    this.guestEmail = guestEmail;
    this.guestName = guestName;
    this.loyaltyNumber = loyaltyNumber;
    this.checkIn = checkIn;
    this.checkOut = checkOut;
    this.rooms = rooms;
    this.expiresAt = expiresAt;
  }

  public UUID getId() {
    return id;
  }

  public Hotel getHotel() {
    return hotel;
  }

  public String getGuestEmail() {
    return guestEmail;
  }

  public String getGuestName() {
    return guestName;
  }

  public String getLoyaltyNumber() {
    return loyaltyNumber;
  }

  public LocalDate getCheckIn() {
    return checkIn;
  }

  public LocalDate getCheckOut() {
    return checkOut;
  }

  public int getRooms() {
    return rooms;
  }

  public HoldStatus getStatus() {
    return status;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public OffsetDateTime getExpiresAt() {
    return expiresAt;
  }

  public OffsetDateTime getConfirmedAt() {
    return confirmedAt;
  }

  public String getPhoneNumber() {
    return phoneNumber;
  }

  public String getBillingReference() {
    return billingReference;
  }

  public void expire() {
    this.status = HoldStatus.EXPIRED;
  }

  public void confirm(String phoneNumber, String billingReference) {
    this.status = HoldStatus.CONFIRMED;
    this.confirmedAt = OffsetDateTime.now();
    this.phoneNumber = phoneNumber;
    this.billingReference = billingReference;
  }
}
