package com.codefest.api.hotel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "hotels")
public class Hotel {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false)
  private String city;

  @Column(nullable = false)
  private String country;

  @Column(nullable = false, columnDefinition = "text")
  private String description;

  @Column(nullable = false, precision = 10, scale = 2)
  private BigDecimal nightlyRate;

  @Column(nullable = false, length = 3)
  private String currency;

  @Column(nullable = false)
  private int availableRooms;

  protected Hotel() {}

  public Hotel(
      String name,
      String city,
      String country,
      String description,
      BigDecimal nightlyRate,
      String currency,
      int availableRooms) {
    this.name = name;
    this.city = city;
    this.country = country;
    this.description = description;
    this.nightlyRate = nightlyRate;
    this.currency = currency;
    this.availableRooms = availableRooms;
  }

  public Long getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public String getCity() {
    return city;
  }

  public String getCountry() {
    return country;
  }

  public String getDescription() {
    return description;
  }

  public BigDecimal getNightlyRate() {
    return nightlyRate;
  }

  public String getCurrency() {
    return currency;
  }

  public int getAvailableRooms() {
    return availableRooms;
  }
}
