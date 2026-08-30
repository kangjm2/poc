package com.vdt.analyzer.repo;

import com.vdt.analyzer.domain.KpiDefinition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface KpiDefinitionRepo extends JpaRepository<KpiDefinition, String> {

    @Query("SELECT DISTINCT d FROM KpiDefinition d LEFT JOIN FETCH d.thresholds "
            + "ORDER BY d.category, d.displayName")
    List<KpiDefinition> findAllByOrderByCategoryAscDisplayNameAsc();

    @Query("SELECT DISTINCT d FROM KpiDefinition d LEFT JOIN FETCH d.thresholds WHERE d.name = ?1")
    Optional<KpiDefinition> findWithThresholds(String name);
}
