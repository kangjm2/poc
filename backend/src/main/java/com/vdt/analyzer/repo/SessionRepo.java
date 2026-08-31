package com.vdt.analyzer.repo;

import com.vdt.analyzer.domain.MeasurementSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SessionRepo extends JpaRepository<MeasurementSession, Long> {
    List<MeasurementSession> findAllByOrderByStartedAtDesc();
}
