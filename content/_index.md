---
title:
type: landing
sections:
  - block: about.biography
    id: about
    content:
      title: About me
      username: admin
  - block: experience
    id: experience
    content:
      title: Experience
      date_format: Jan 2006
      items:
        - title: Graduate Teaching Assistant
          company: University of Kansas
          company_url: "https://ku.edu"
          # company_logo: sds
          location: Lawrence, KS
          date_start: "2025-08-18"
          # date_end: "2025-07-30"

          # date_end: "Present"
          description: |2-
            - Conduct weekly labs on C/C++, Git, and Docker for 30+ undergraduate  students; also grade assignments, in-class problems, and labs.
        - title: Machine Learning Engineer
          company: Smart Data Solutions
          company_url: "https://sdata.us/"
          # company_logo: sds
          location: Eagan, MN (Remote)
          date_start: "2024-01-01"
          date_end: "2025-07-30"

          # date_end: "Present"
          description: |2-
            - Worked on information extraction from healthcare-related documents, including insurance claims and medical records. Performed data collection, cleaning, and model training for information extraction.
            - Developed an intelligent medical record processing system to extract important information from medical records using models like LayoutLM and Large Language Models.
        - title: Machine Learning/Backend Engineer
          company: Naamche
          company_url: ""
          # company_logo: next
          location: Kathmandu, Nepal
          date_start: "2023-05-01"
          date_end: "2023-12-31"
          description: |2-
            - Created chatbots using Large Language Models (LLMs) for real estate and university extension centers.
            - Collected, cleaned, and indexed data in a vector database for implementing RAG-based framework, using tools like Scrapy, Metabase, and AWS Sagemaker.
            - Developed API using FastAPI framework and implemented guardrails for chatbots.
        # - title: Computer Vision/Backend Engineer
        #   company: Sandbox Inc
        #   company_url: ""
        #   # company_logo: reading
        #   location: Pokhara, Nepal (Remote)
        #   date_start: "2023-02-01"
        #   date_end: "2023-05-31"
        #   description: |2-
        #     - Developed a game bot for playing MOBA games using OpenCV.
        #     - Worked on Django to create APIs for the bot platform.
        - title: Machine Learning Internship
          company: Wiseyak Inc
          company_url: ""
          # company_logo: reading
          location: Kathmandu, Nepal
          date_start: "2023-01-01"
          date_end: "2023-04-30"
          description: |2-
            - Worked on NLP and learned about RNNs and Transformer-based models, focusing on attention mechanisms used by Transformers.
            - Developed chatbots using the RASA framework.
        - title: Technical Coordinator
          company: LOCUS
          company_url: ""
          # company_logo: reading
          location: Lalitpur, Nepal
          date_start: "2022-03-01"
          date_end: "2023-03-01"
          description: |2-
            - Managed software events and maintained software systems including LOCUS's website and its online certification system.
            - Developed and launched the online certification system used at LOCUS.
            - Managed Azure account/virtual servers for deploying LOCUS products.
            - Led a 10-day fellowship program to teach over 120 students software development practices.
        # - title: Freelancer
        #   company: Upwork
        #   company_url: "https://www.upwork.com/freelancers/~0105f236d2f4b5599f"
        #   # company_logo: reading
        #   location: Remote
        #   date_start: "2021-08-01"
        #   date_end: ""
        #   description: |2-
        #     - Worked on web application development, web scraping, and NLP projects.
        #     - Delivered tailored software solutions for startups and earned Top Rated status on Upwork.
        # - title: Full Stack Engineer
        #   company: Clamphook
        #   company_url: ""
        #   # company_logo: reading
        #   location: Remote
        #   date_start: "2021-01-01"
        #   date_end: "2021-04-30"
        #   description: |2-
        #     - Worked on the initial phase of Clamphook, an Ed-tech startup, developing both server-side and client-side functionalities.
        #     - Developed an admin panel for creating multiple choice questions for computer-based tests.
    design:
      columns: "2"

  - block: portfolio
    id: publications
    content:
      title: Publications
      filters:
        folders:
          - publications
    design:
      columns: "2"
      view: 2
      flip_alt_rows: false

  - block: experience
    id: education
    content:
      title: Education
      date_format: Jan 2006
      items:
        - title: University of Kansas
          company: Master of Science in Computer Science
          company_url: "https://ku.edu"
          # company_logo: sds
          location: Lawrence, KS
          date_start: "2025-08-18"
          # date_end: "2025-07-30"

          # date_end: "Present"
          description: |2-
            - Analysis of Algorithms  
            - Advanced Data Science  
            - Static Analysis

        - title: Pulchowk Campus, IOE, Tribhuvan University
          company: Bachelor in Computer Engineering
          # company_url: "https://sdata.us/"
          # company_logo: sds
          location: Kathmandu, Nepal
          date_start: "2019-01-01"
          date_end: "2023-05-30"

          # date_end: "Present"
          description: |2-
            - Artificial Intelligence
            - Data Science
            - Database Management System
            - Object Oriented Programming with C++
            - Operating Systems
            - Distributed Systems
    design:
      columns: "2"
  - block: portfolio
    id: projects
    content:
      title: Projects
      filters:
        folders:
          - projects
    design:
      columns: "2"
      view: 2
      flip_alt_rows: false

  - block: portfolio
    id: blogs
    content:
      title: Blogs
      filters:
        folders:
          - posts

    design:
      columns: "2"
      view: 2
      flip_alt_rows: false
---
