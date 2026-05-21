package com.codefest.api.hotel;

import java.math.BigDecimal;
import java.util.List;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
public class HotelSeeder implements CommandLineRunner {
  private final HotelRepository hotelRepository;

  public HotelSeeder(HotelRepository hotelRepository) {
    this.hotelRepository = hotelRepository;
  }

  @Override
  public void run(String... args) {
    seedHotels()
        .forEach(
            hotel -> {
              if (!hotelRepository.existsByNameIgnoreCaseAndCityIgnoreCase(hotel.name(), hotel.city())) {
                hotelRepository.save(
                    new Hotel(
                        hotel.name(),
                        hotel.city(),
                        hotel.country(),
                        hotel.description(),
                        hotel.nightlyRate(),
                        hotel.currency(),
                        hotel.availableRooms()));
              }
            });
  }

  private List<SeedHotel> seedHotels() {
    return List.of(
        new SeedHotel(
            "North Loop House",
            "Minneapolis",
            "US",
            "Modern downtown hotel near restaurants, transit, and event venues.",
            new BigDecimal("189.00"),
            "USD",
            12),
        new SeedHotel(
            "Riverfront Suites",
            "Chicago",
            "US",
            "Suite-focused hotel with skyline views and quick access to the riverwalk.",
            new BigDecimal("249.00"),
            "USD",
            8),
        new SeedHotel(
            "Capitol Garden Inn",
            "Austin",
            "US",
            "Quiet boutique hotel with meeting rooms and a courtyard workspace.",
            new BigDecimal("159.00"),
            "USD",
            10),
        new SeedHotel(
            "Harbor Light Hotel",
            "Seattle",
            "US",
            "Waterfront hotel with meeting suites, ferry access, and mountain views.",
            new BigDecimal("229.00"),
            "USD",
            9),
        new SeedHotel(
            "Mission Bay Lodge",
            "San Francisco",
            "US",
            "Compact business hotel near transit, medical offices, and waterfront trails.",
            new BigDecimal("279.00"),
            "USD",
            6),
        new SeedHotel(
            "Union Square Grand",
            "New York",
            "US",
            "Full-service hotel with flexible workspaces and quick subway access.",
            new BigDecimal("319.00"),
            "USD",
            11),
        new SeedHotel(
            "Peachtree Commons",
            "Atlanta",
            "US",
            "Downtown hotel with conference rooms and easy airport rail connections.",
            new BigDecimal("174.00"),
            "USD",
            14),
        new SeedHotel(
            "Back Bay Terrace",
            "Boston",
            "US",
            "Neighborhood hotel near offices, restaurants, and riverfront running paths.",
            new BigDecimal("264.00"),
            "USD",
            7),
        new SeedHotel(
            "Cherry Creek Station",
            "Denver",
            "US",
            "Modern stay with coworking areas, mountain shuttles, and secure parking.",
            new BigDecimal("205.00"),
            "USD",
            13),
        new SeedHotel(
            "Arts District Hotel",
            "Los Angeles",
            "US",
            "Design-forward hotel near galleries, dining, and downtown event venues.",
            new BigDecimal("238.00"),
            "USD",
            8),
        new SeedHotel(
            "Biscayne Palm Resort",
            "Miami",
            "US",
            "Bright resort-style hotel with pool deck, meeting cabanas, and bay access.",
            new BigDecimal("221.00"),
            "USD",
            15),
        new SeedHotel(
            "Music Row Suites",
            "Nashville",
            "US",
            "Suite hotel close to studios, restaurants, and small event spaces.",
            new BigDecimal("183.00"),
            "USD",
            10));
  }

  private record SeedHotel(
      String name,
      String city,
      String country,
      String description,
      BigDecimal nightlyRate,
      String currency,
      int availableRooms) {}
}
