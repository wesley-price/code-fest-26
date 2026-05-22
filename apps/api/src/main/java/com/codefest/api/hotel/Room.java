package com.codefest.api.hotel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "rooms")
public class Room {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "hotel_id", nullable = false)
  private Hotel hotel;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false)
  private boolean hasView;

  @Column(nullable = false, precision = 10, scale = 2)
  private BigDecimal nightlyRate;

  @Column(nullable = false, length = 3)
  private String currency;

  @Column(nullable = false)
  private int availableCount;

  protected Room() {}

  public Room(Hotel hotel, String name, boolean hasView, BigDecimal nightlyRate, String currency, int availableCount) {
    this.hotel = hotel;
    this.name = name;
    this.hasView = hasView;
    this.nightlyRate = nightlyRate;
    this.currency = currency;
    this.availableCount = availableCount;
  }

  public Long getId() { return id; }
  public Hotel getHotel() { return hotel; }
  public String getName() { return name; }
  public boolean isHasView() { return hasView; }
  public BigDecimal getNightlyRate() { return nightlyRate; }
  public String getCurrency() { return currency; }
  public int getAvailableCount() { return availableCount; }
}
